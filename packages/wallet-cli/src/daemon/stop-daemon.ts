import { rm } from 'node:fs/promises';

import { pingDaemon, sendCommand } from './daemon-client';
import { isProcessAlive, readPidFile, sendSignal, waitFor } from './utils';

/**
 * Stop the daemon via a `shutdown` RPC call. Falls back to PID + SIGTERM if
 * the socket is unresponsive, and escalates to SIGKILL if SIGTERM is ignored.
 *
 * @param socketPath - The daemon socket path.
 * @param pidPath - The daemon PID file path.
 * @param log - Optional logging function for status messages.
 * @returns True if the daemon was stopped (or was not running).
 */
export async function stopDaemon(
  socketPath: string,
  pidPath: string,
  log?: (message: string) => void,
): Promise<boolean> {
  const pid = await readPidFile(pidPath);
  const processAlive = pid !== undefined && isProcessAlive(pid);
  const socketResponsive = await pingDaemon(socketPath);

  if (!socketResponsive && !processAlive) {
    if (pid !== undefined) {
      await rm(pidPath, { force: true });
    }
    return true;
  }

  log?.('Stopping daemon...');

  let stopped = false;

  // Strategy 1: Graceful socket-based shutdown.
  if (socketResponsive) {
    try {
      await sendCommand({ socketPath, method: 'shutdown' });
    } catch (error) {
      log?.(`Graceful shutdown request failed: ${String(error)}`);
    }
    stopped = await waitFor(async () => !(await pingDaemon(socketPath)), 5_000);
  }

  // Strategy 2: SIGTERM.
  if (!stopped && pid !== undefined) {
    try {
      if (sendSignal(pid, 'SIGTERM')) {
        stopped = await waitFor(() => !isProcessAlive(pid), 5_000);
      } else {
        stopped = true; // Process already gone (ESRCH).
      }
    } catch (error) {
      log?.(`SIGTERM failed: ${String(error)}`);
    }
  }

  // Strategy 3: SIGKILL.
  if (!stopped && pid !== undefined) {
    try {
      if (sendSignal(pid, 'SIGKILL')) {
        stopped = await waitFor(() => !isProcessAlive(pid), 2_000);
      } else {
        stopped = true; // Process already gone (ESRCH).
      }
    } catch (error) {
      log?.(`SIGKILL failed: ${String(error)}`);
    }
  }

  if (stopped) {
    await Promise.all([
      rm(pidPath, { force: true }),
      rm(socketPath, { force: true }),
    ]);
    log?.('Daemon stopped.');
  }

  return stopped;
}
