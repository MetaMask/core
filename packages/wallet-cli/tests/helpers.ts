import { rm } from 'node:fs/promises';

import { getDaemonPaths } from '../src/daemon/paths.js';
import { isProcessAlive, readPidFile } from '../src/daemon/utils.js';

/**
 * Guarantee no daemon is left running and remove the temp data directory,
 * regardless of how a test ended. Kills by the recorded PID directly (rather
 * than going through `mm daemon stop`) so a wedged daemon cannot block cleanup.
 *
 * Shared by the subprocess e2e suites in this directory; each points the CLI at
 * its own temp `dataDir`, so tearing that down is identical across them.
 *
 * @param dataDir - The temp data directory to tear down.
 */
export async function cleanupDaemon(dataDir: string): Promise<void> {
  const { pidPath } = getDaemonPaths(dataDir);
  const pid = await readPidFile(pidPath).catch(() => undefined);
  if (pid !== undefined && isProcessAlive(pid)) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Already gone — nothing to clean up.
    }
  }
  await rm(dataDir, { recursive: true, force: true });
}
