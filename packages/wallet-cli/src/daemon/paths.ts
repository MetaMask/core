import { join } from 'node:path';

import type { DaemonPaths } from './types';

/**
 * Resolve paths for daemon state files within the given data directory.
 *
 * @param dataDir - The base data directory (e.g. oclif config.dataDir).
 * @returns Resolved paths for socket, PID file, log file, and database file.
 */
export function getDaemonPaths(dataDir: string): DaemonPaths {
  return {
    socketPath: join(dataDir, 'daemon.sock'),
    pidPath: join(dataDir, 'daemon.pid'),
    logPath: join(dataDir, 'daemon.log'),
    dbPath: join(dataDir, 'wallet.db'),
  };
}
