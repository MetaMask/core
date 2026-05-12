import { rm } from 'node:fs/promises';

import { pingDaemon, sendCommand } from './daemon-client';
import { isProcessAlive, readPidFile, sendSignal, waitFor } from './utils';

/**
 * Stop the daemon via a `shutdown` RPC call. Falls back to PID + SIGTERM if
 * the socket is unresponsive, and escalates to SIGKILL if SIGTERM is ignored.
 *
 * Signals are only sent if pinging the socket yielded `responsive` or
 * `unreachable` (i.e. we did not see `ENOENT`). When the ping is `absent`
 * we decline to signal the recorded PID, because long-running workstations
 * can recycle PIDs to unrelated processes; we just clean up the stale PID
 * file.
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
  const ping = await pingDaemon(socketPath);
  const socketObserved =
    ping.status === 'responsive' || ping.status === 'unreachable';
  const processAlive =
    pid !== undefined && socketObserved && isProcessAlive(pid);

  if (!socketObserved && !processAlive) {
    // No live daemon evidence. Just remove the stale PID file if any.
    await cleanupFile(pidPath, 'PID file', log);
    return true;
  }

  log?.('Stopping daemon...');

  let stopped = false;

  // Strategy 1: Graceful socket-based shutdown.
  if (ping.status === 'responsive') {
    try {
      await sendCommand({ socketPath, method: 'shutdown' });
    } catch (error) {
      log?.(`Graceful shutdown request failed: ${String(error)}`);
    }
    stopped = await waitFor(
      async () => (await pingDaemon(socketPath)).status !== 'responsive',
      5_000,
    );
  }

  // Strategy 2: SIGTERM. Only signal when we have evidence the socket
  // belongs to a live process (socketObserved && processAlive).
  if (!stopped && processAlive && pid !== undefined) {
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
  if (!stopped && processAlive && pid !== undefined) {
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
    await cleanupFile(pidPath, 'PID file', log);
    await cleanupFile(socketPath, 'socket file', log);
    log?.('Daemon stopped.');
  }

  return stopped;
}

/**
 * Remove a file best-effort, logging any failure rather than letting it
 * propagate. ENOENT is silently ignored via `force: true`.
 *
 * @param path - The file path to remove.
 * @param label - Human-readable label for log messages.
 * @param log - Optional log sink.
 */
async function cleanupFile(
  path: string,
  label: string,
  log: ((message: string) => void) | undefined,
): Promise<void> {
  await rm(path, { force: true }).catch((error: unknown) => {
    log?.(`Failed to remove ${label}: ${String(error)}`);
  });
}
