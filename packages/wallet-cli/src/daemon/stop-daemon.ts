import { rm } from 'node:fs/promises';

import { pingDaemon, sendCommand } from './daemon-client.js';
import { isProcessAlive, readPidFile, sendSignal, waitFor } from './utils.js';

/**
 * Stop the daemon, preferring a graceful shutdown.
 *
 * Resolution order when a live daemon is present:
 * 1. If the socket is responsive, request a graceful `shutdown` over it.
 * 2. If the recorded PID is still alive, escalate to SIGTERM.
 * 3. ...then SIGKILL.
 *
 * Signals (steps 2-3) are only ever sent against a PID that is observed alive.
 * The socket-absent + alive-PID branch trades a small risk of signalling a
 * recycled PID for the larger risk of leaving an orphan daemon holding the
 * SQLite database — which `daemon purge` would otherwise wipe out from under
 * it.
 *
 * When the socket is NOT responsive AND the recorded PID is dead (or there is
 * no PID file), there is no live daemon: a lingering socket or PID file is
 * stale leftovers from a daemon that already exited — typically one that
 * crashed without running its own cleanup. Those files are removed and the
 * stop is reported as successful, rather than failing on a daemon that is
 * already gone.
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
  const processAlive = pid !== undefined && isProcessAlive(pid);

  // Only `absent` and `refused` prove no live daemon; `permission`/`timeout`/
  // `protocol` may be a wedged or foreign daemon, so those fall through.
  const socketProvenGone =
    ping.status === 'absent' ||
    (ping.status === 'unreachable' && ping.reason === 'refused');

  if (socketProvenGone && !processAlive) {
    await cleanupFile(pidPath, 'PID file', log);
    await cleanupFile(socketPath, 'socket file', log);
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
    // A quiet socket does not prove the process exited; require the recorded
    // pid to be gone too, so a daemon that outlived its socket falls through to
    // SIGTERM/SIGKILL rather than being orphaned.
    stopped = await waitFor(
      async () =>
        (await pingDaemon(socketPath)).status !== 'responsive' &&
        (pid === undefined || !isProcessAlive(pid)),
      5_000,
    );
  }

  // Strategy 2: SIGTERM. Signal when either the socket was observed or the
  // recorded PID is alive; the absent+alive case typically means someone
  // removed the socket from under a live daemon.
  if (!stopped && processAlive && pid !== undefined) {
    if (!socketObserved) {
      log?.(
        `Socket at ${socketPath} is absent but recorded pid ${pid} is alive; signalling anyway.`,
      );
    }
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
