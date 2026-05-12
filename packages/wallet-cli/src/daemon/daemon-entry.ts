import type { Json } from '@metamask/utils';
import { mkdirSync } from 'node:fs';
import { appendFile, readFile, rm, writeFile } from 'node:fs/promises';

import { pingDaemon } from './daemon-client';
import { getDaemonPaths } from './paths';
import { startRpcSocketServer } from './rpc-socket-server';
import type { RpcSocketServerHandle } from './rpc-socket-server';
import type { DaemonStatusInfo, RpcHandlerMap } from './types';
import { isErrorWithCode } from './utils';
import { createWallet } from './wallet-factory';

const startTime = Date.now();

main().catch((error: unknown) => {
  process.stderr.write(`Daemon fatal: ${String(error)}\n`);
  process.exitCode = 1;
});

/**
 * Main daemon entry point. Starts the daemon process and keeps it running.
 */
async function main(): Promise<void> {
  const dataDir = process.env.MM_DAEMON_DATA_DIR;
  if (!dataDir) {
    throw new Error('MM_DAEMON_DATA_DIR environment variable is required');
  }

  const infuraProjectId = process.env.INFURA_PROJECT_ID;
  if (!infuraProjectId) {
    throw new Error('INFURA_PROJECT_ID environment variable is required');
  }

  const password = process.env.MM_WALLET_PASSWORD;
  if (!password) {
    throw new Error('MM_WALLET_PASSWORD environment variable is required');
  }

  const srp = process.env.MM_WALLET_SRP;
  if (!srp) {
    throw new Error('MM_WALLET_SRP environment variable is required');
  }

  mkdirSync(dataDir, { recursive: true });

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

  const { wallet, store } = await createWallet({
    databasePath: dbPath,
    infuraProjectId,
    password,
    srp,
  });

  const handlers: RpcHandlerMap = {
    getStatus: async (): Promise<DaemonStatusInfo> => ({
      pid: process.pid,
      uptime: Math.floor((Date.now() - startTime) / 1000),
    }),
    // Arbitrary messenger dispatch is intentional: the CLI exposes the full
    // messenger surface over a Unix socket inside the per-user oclif data
    // directory. Anything that can open that path can call into the wallet —
    // no in-process auth check is performed.
    call: async (params) => {
      if (!Array.isArray(params) || typeof params[0] !== 'string') {
        throw new Error('Expected params to be an array with an action name');
      }
      const [action, ...args] = params as [string, ...Json[]];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- The messenger is strongly typed; we bypass it here to dispatch arbitrary action names from RPC.
      const result = (wallet.messenger as any).call(action, ...args);
      return (result instanceof Promise ? await result : result) as Json;
    },
  };

  let handle: RpcSocketServerHandle;
  try {
    // Exclusive create — if another daemon raced us between claimDaemonSlot
    // and here, this fails with EEXIST and we abort rather than orphan the
    // sibling daemon's PID file.
    await writeFile(pidPath, pidFileContents, { flag: 'wx' });

    handle = await startRpcSocketServer({
      socketPath,
      handlers,
      onShutdown: async () => shutdown('RPC shutdown'),
    });
  } catch (error) {
    try {
      await wallet.destroy();
    } catch (destroyError) {
      log(`wallet.destroy() failed during cleanup: ${String(destroyError)}`);
    }
    try {
      store.close();
    } catch (closeError) {
      log(`store.close() failed during cleanup: ${String(closeError)}`);
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
          await handle.close();
        } catch (closeError) {
          log(`handle.close() failed: ${String(closeError)}`);
        }
        try {
          await wallet.destroy();
        } catch (destroyError) {
          log(`wallet.destroy() failed: ${String(destroyError)}`);
        }
        try {
          store.close();
        } catch (closeError) {
          log(`store.close() failed: ${String(closeError)}`);
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
    /* istanbul ignore next */
    shutdown('SIGTERM').catch(() => undefined);
  });
  process.on('SIGINT', () => {
    /* istanbul ignore next */
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
  log: (message: string) => void,
): Promise<void> {
  const existingPid = await readPidFromFile(pidPath);
  if (existingPid === undefined) {
    // No PID file. Still possible the socket file exists from a crashed run;
    // ping it to confirm before removing.
    const ping = await pingDaemon(socketPath);
    if (ping.status === 'responsive') {
      throw new Error(
        `A daemon is already running on ${socketPath} (no PID file present)`,
      );
    }
    if (ping.status === 'unreachable') {
      log(`Removing stale socket at ${socketPath} (${ping.error.message})`);
    }
    await rm(socketPath, { force: true });
    return;
  }

  const ping = await pingDaemon(socketPath);
  if (ping.status === 'responsive') {
    throw new Error(
      `A daemon is already running (pid ${existingPid}, socket ${socketPath})`,
    );
  }

  log(`Removing stale daemon state (recorded pid ${existingPid}).`);
  await Promise.all([
    rm(pidPath, { force: true }),
    rm(socketPath, { force: true }),
  ]);
}

/**
 * Read the PID number from a PID file. Returns undefined when the file is
 * missing or malformed. Reads only the first line so files written with
 * `${pid}\n${startTime}\n` format are parsed correctly.
 *
 * @param pidPath - Path to the PID file.
 * @returns The PID, or undefined if missing or unparseable.
 */
async function readPidFromFile(pidPath: string): Promise<number | undefined> {
  let contents: string;
  try {
    contents = await readFile(pidPath, 'utf-8');
  } catch (error: unknown) {
    if (isErrorWithCode(error, 'ENOENT')) {
      return undefined;
    }
    throw error;
  }
  // String.prototype.split always returns at least one element, so [0] is safe.
  const pid = Number(contents.split('\n')[0].trim());
  return Number.isInteger(pid) && pid > 0 ? pid : undefined;
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
 * Create a simple file logger.
 *
 * @param logPath - The log file path.
 * @returns A logging function.
 */
function makeLogger(logPath: string): (message: string) => void {
  return (message: string): void => {
    const line = `[${new Date().toISOString()}] ${message}\n`;
    appendFile(logPath, line).catch((error: unknown) => {
      process.stderr.write(`[log write failed: ${String(error)}] ${message}\n`);
    });
  };
}
