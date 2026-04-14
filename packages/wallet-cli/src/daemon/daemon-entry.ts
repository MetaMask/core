import type { Json } from '@metamask/utils';
import { mkdirSync } from 'node:fs';
import { appendFile, rm, writeFile } from 'node:fs/promises';

import { getDaemonPaths } from './paths';
import { startRpcSocketServer } from './rpc-socket-server';
import type { RpcSocketServerHandle } from './rpc-socket-server';
import type { DaemonStatusInfo, RpcHandlerMap } from './types';
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
  } = getDaemonPaths(dataDir);
  const socketPath = process.env.MM_DAEMON_SOCKET_PATH ?? defaultSocketPath;

  const log = makeLogger(logPath);
  log('Starting daemon...');

  const wallet = await createWallet({ infuraProjectId, password, srp });

  const handlers: RpcHandlerMap = {
    getStatus: async (): Promise<DaemonStatusInfo> => ({
      pid: process.pid,
      uptime: Math.floor((Date.now() - startTime) / 1000),
    }),
    // Arbitrary messenger dispatch is intentional: the CLI exposes the full
    // messenger surface over a local Unix socket.  Access control is enforced
    // at the socket level (only local users can connect).
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
    await writeFile(pidPath, String(process.pid));

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
    await rm(pidPath, { force: true }).catch((rmError: unknown) => {
      log(`Failed to remove PID file during cleanup: ${String(rmError)}`);
    });
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
        await Promise.all([
          rm(pidPath, { force: true }).catch((rmError: unknown) => {
            log(`Failed to remove PID file: ${String(rmError)}`);
          }),
          rm(socketPath, { force: true }).catch((rmError: unknown) => {
            log(`Failed to remove socket file: ${String(rmError)}`);
          }),
        ]);
      })();
    }
    return shutdownPromise;
  }

  process.on('SIGTERM', () => {
    shutdown('SIGTERM').catch(() => undefined);
  });
  process.on('SIGINT', () => {
    shutdown('SIGINT').catch(() => undefined);
  });
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
