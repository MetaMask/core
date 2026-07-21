import { define, literal } from '@metamask/superstruct';
import type { Json } from '@metamask/utils';
import type { Wallet } from '@metamask/wallet';
import { appendFile, readFile, rm, writeFile } from 'node:fs/promises';

import { pingDaemon } from './daemon-client';
import { ensureOwnerOnlyDirectory } from './data-dir';
import { getDaemonPaths } from './paths';
import { startRpcSocketServer } from './rpc-socket-server';
import type { RpcSocketServerHandle } from './rpc-socket-server';
import { Password, Srp } from './secrets';
import { defineHandler } from './types';
import type {
  DaemonStatusInfo,
  Logger,
  RpcDispatcher,
  RpcHandlerMap,
} from './types';
import { isErrorWithCode, isProcessAlive, readPidFile } from './utils';
import { createWallet } from './wallet-factory';

/**
 * Params struct for the `call` RPC method. `params` must be a non-empty array
 * whose first element is the messenger action name; remaining elements are
 * positional action arguments forwarded as-is to `messenger.call`.
 */
const callParamsStruct = define<[string, ...unknown[]]>(
  'CallParams',
  (value) => {
    if (!Array.isArray(value)) {
      return 'Expected an array';
    }
    if (value.length === 0) {
      return 'Expected a non-empty array';
    }
    if (typeof value[0] !== 'string') {
      return 'Expected the first element to be a string action name';
    }
    return true;
  },
);

const startTime = Date.now();

main().catch((error: unknown) => {
  process.stderr.write(`Daemon fatal: ${String(error)}\n`);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const dataDir = process.env.MM_DAEMON_DATA_DIR;
  if (!dataDir) {
    throw new Error('MM_DAEMON_DATA_DIR environment variable is required');
  }

  const infuraProjectId = process.env.INFURA_PROJECT_ID;
  if (!infuraProjectId) {
    throw new Error('INFURA_PROJECT_ID environment variable is required');
  }

  // Password is optional: when absent, the daemon starts without unlocking
  // the keyring (e.g. when the user prefers to call `mm wallet unlock`
  // interactively rather than embed the password in their environment).
  // First-run startup still requires a password; wallet-factory enforces
  // that and surfaces a clear error.
  const passwordRaw = process.env.MM_WALLET_PASSWORD;

  const srpRaw = process.env.MM_WALLET_SRP;
  if (!srpRaw) {
    throw new Error('MM_WALLET_SRP environment variable is required');
  }

  // Scrub before validation so a throw from Password.from / Srp.from (bad
  // value) does not leave the raw secrets in the long-lived daemon's env.
  delete process.env.MM_WALLET_PASSWORD;
  delete process.env.MM_WALLET_SRP;

  const password = passwordRaw ? Password.from(passwordRaw) : undefined;
  const srp = Srp.from(srpRaw);

  await ensureOwnerOnlyDirectory(dataDir);

  const {
    socketPath: defaultSocketPath,
    pidPath,
    logPath,
    dbPath,
  } = getDaemonPaths(dataDir);
  const socketPath = process.env.MM_DAEMON_SOCKET_PATH ?? defaultSocketPath;

  const log = makeLogger(logPath);
  log('Starting daemon...');

  // Pre-flight: refuse to take over if a responsive daemon already owns this
  // socket. If the existing PID file is stale (or the socket is dead), clean
  // it up so the exclusive PID-file write below has a chance to succeed.
  await claimDaemonSlot(pidPath, socketPath, log);

  const pidFileContents = `${process.pid}\n${startTime}\n`;

  // Claim the slot atomically BEFORE opening the SQLite database or
  // constructing the Wallet. Two concurrent `daemon start` invocations can
  // both pass `claimDaemonSlot` (the gap between its preflight and the slot
  // write is racy); without this ordering, both would open `wallet.db` and
  // both would run first-run SRP import before one loses the wx race.
  try {
    await writeFile(pidPath, pidFileContents, { flag: 'wx' });
  } catch (error) {
    throw error instanceof Error
      ? Object.assign(error, {
          message: `Failed to claim daemon slot at ${pidPath}: ${error.message}`,
        })
      : /* istanbul ignore next -- node:fs/promises always rejects with an Error */
        new Error(
          `Failed to claim daemon slot at ${pidPath}: ${String(error)}`,
        );
  }

  let wallet: Wallet | undefined;
  let dispose: (() => Promise<void>) | undefined;
  let handle: RpcSocketServerHandle | undefined;

  try {
    ({ wallet, dispose } = await createWallet({
      databasePath: dbPath,
      password,
      srp,
      infuraProjectId,
      log,
    }));

    const constructedWallet = wallet;
    // Arbitrary messenger dispatch is intentional: the CLI exposes the full
    // messenger surface over a Unix socket inside the per-user oclif data
    // directory. The dataDir is chmodded to 0o700 above and the socket to
    // 0o600 by the RPC server on bind, so only the owning user can open them,
    // but there is no in-process auth check beyond that filesystem-permission
    // barrier. The messenger is strongly typed by action name; we narrow it
    // once here to the RpcDispatcher shape the `call` handler needs.
    const dispatch = constructedWallet.messenger.call.bind(
      constructedWallet.messenger,
    ) as unknown as RpcDispatcher;

    const handlers: RpcHandlerMap = {
      getStatus: defineHandler(
        literal(null),
        async (): Promise<DaemonStatusInfo> => ({
          pid: process.pid,
          uptime: Math.floor((Date.now() - startTime) / 1000),
        }),
      ),
      call: defineHandler(callParamsStruct, async (params) => {
        const [action, ...args] = params;
        return await dispatch(action, ...(args as Json[]));
      }),
      // Exposes the callable surface for discovery: it grows silently as
      // controllers are wired, so consumers need a way to see it without a
      // hand-kept catalog that would rot.
      listActions: defineHandler(
        literal(null),
        async (): Promise<Json> =>
          constructedWallet.messenger.getRegisteredActionTypes(),
      ),
    };

    // `startRpcSocketServer` restricts the socket to the owner (chmod 0o600)
    // on bind and never leaves a live server/socket behind if it rejects, so
    // the catch below has nothing of its own to close.
    handle = await startRpcSocketServer({
      socketPath,
      handlers,
      onShutdown: async () => shutdown('RPC shutdown'),
      log,
    });
  } catch (error) {
    // `dispose` is undefined only when `createWallet` itself threw — it has
    // already torn down its own store in that case.
    if (dispose) {
      await dispose();
    }
    // Only remove the PID file if it's still ours (we may have lost the race
    // and the file now belongs to another daemon).
    await removeOwnedPidFile(pidPath, pidFileContents).catch(
      (rmError: unknown) => {
        log(`Failed to remove PID file during cleanup: ${String(rmError)}`);
      },
    );
    throw error;
  }

  // Stable non-undefined refs for the shutdown closures (TS won't narrow the
  // outer `let`s across closure escape).
  const activeHandle = handle;
  const activeDispose = dispose;

  log(`Daemon started. Socket: ${socketPath}`);

  let shutdownPromise: Promise<void> | undefined;

  /**
   * Shut down the daemon idempotently. Concurrent calls coalesce.
   *
   * @param reason - A label describing why shutdown was triggered.
   * @returns A promise that resolves when shutdown completes.
   */
  async function shutdown(reason: string): Promise<void> {
    if (shutdownPromise === undefined) {
      log(`Shutting down (${reason})...`);
      shutdownPromise = (async (): Promise<void> => {
        try {
          await activeHandle.close();
        } catch (closeError) {
          log(`handle.close() failed: ${String(closeError)}`);
        }
        try {
          await activeDispose();
        } catch (disposeError) {
          log(`dispose() failed during shutdown: ${String(disposeError)}`);
        }
        await Promise.all([
          removeOwnedPidFile(pidPath, pidFileContents).catch(
            (rmError: unknown) => {
              log(`Failed to remove PID file: ${String(rmError)}`);
            },
          ),
          rm(socketPath, { force: true }).catch((rmError: unknown) => {
            log(`Failed to remove socket file: ${String(rmError)}`);
          }),
        ]);
      })();
    }
    return shutdownPromise;
  }

  process.on('SIGTERM', () => {
    /* istanbul ignore next -- `shutdown` logs each step internally; the catch only guards against an unhandled rejection from the signal handler. */
    shutdown('SIGTERM').catch(() => undefined);
  });
  process.on('SIGINT', () => {
    /* istanbul ignore next -- `shutdown` logs each step internally; the catch only guards against an unhandled rejection from the signal handler. */
    shutdown('SIGINT').catch(() => undefined);
  });
}

/**
 * Refuse to start if a responsive daemon already owns the socket. Otherwise
 * clear any stale PID/socket files so the exclusive PID-file write can
 * proceed.
 *
 * @param pidPath - The PID file path.
 * @param socketPath - The socket path.
 * @param log - Logger for diagnostic messages.
 */
async function claimDaemonSlot(
  pidPath: string,
  socketPath: string,
  log: Logger,
): Promise<void> {
  const existingPid = await readPidFile(pidPath);
  const ping = await pingDaemon(socketPath);

  if (ping.status === 'responsive') {
    const pidPart =
      existingPid === undefined
        ? '(no PID file present)'
        : `(pid ${existingPid})`;
    throw new Error(`A daemon is already running on ${socketPath} ${pidPart}`);
  }

  // Refuse to clobber when the recorded PID is still alive, regardless of
  // whether the socket exists. Possible scenarios:
  // - `unreachable`: wedged or mid-startup sibling daemon (socket present
  //   but not responding to JSON-RPC).
  // - `absent`: a sibling daemon that hasn't yet bound its socket, or one
  //   whose socket was manually removed. In either case, removing its PID
  //   file would orphan it from `daemon stop`.
  if (existingPid !== undefined && isProcessAlive(existingPid)) {
    const detail =
      ping.status === 'unreachable'
        ? `socket at ${socketPath} is unresponsive (${ping.error.message})`
        : `no socket at ${socketPath}, but pid is still alive`;
    throw new Error(
      `A daemon is already running (pid ${existingPid}): ${detail}. ` +
        `Run \`mm daemon stop\` (or \`mm daemon purge\`) before starting a new daemon.`,
    );
  }

  if (ping.status === 'unreachable') {
    log(`Removing stale socket at ${socketPath} (${ping.error.message}).`);
  }
  // Always clear both files before claiming the slot. The PID file may be
  // corrupt (truncated, partial write from a crashed run); without this, the
  // exclusive `wx` write below would fail with EEXIST and the daemon could
  // not start until a human manually deleted the file.
  await Promise.all([
    rm(pidPath, { force: true }),
    rm(socketPath, { force: true }),
  ]);
}

/**
 * Remove the PID file only if it still contains our exact contents. Guards
 * against a racing daemon's PID file being removed by this daemon during
 * cleanup.
 *
 * @param pidPath - Path to the PID file.
 * @param expectedContents - The contents we wrote when claiming the slot.
 */
async function removeOwnedPidFile(
  pidPath: string,
  expectedContents: string,
): Promise<void> {
  let actual: string;
  try {
    actual = await readFile(pidPath, 'utf-8');
  } catch (error: unknown) {
    if (isErrorWithCode(error, 'ENOENT')) {
      return;
    }
    throw error;
  }
  if (actual === expectedContents) {
    await rm(pidPath, { force: true });
  }
}

/**
 * Create a file logger that appends timestamped lines to `logPath`, falling
 * back to stderr if the append fails.
 *
 * @param logPath - The log file path.
 * @returns A logging function.
 */
function makeLogger(logPath: string): Logger {
  return (message: string): void => {
    const line = `[${new Date().toISOString()}] ${message}\n`;
    appendFile(logPath, line).catch((error: unknown) => {
      process.stderr.write(`[log write failed: ${String(error)}] ${message}\n`);
    });
  };
}
