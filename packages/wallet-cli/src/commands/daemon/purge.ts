import { Command, Flags } from '@oclif/core';
import { rm } from 'node:fs/promises';

import { getDaemonPaths } from '../../daemon/paths';
import { stopDaemon } from '../../daemon/stop-daemon';

export default class DaemonPurge extends Command {
  static override description =
    'Stop the daemon and delete all daemon state files';

  static override examples = [
    '<%= config.bin %> daemon purge',
    '<%= config.bin %> daemon purge --force',
  ];

  static override flags = {
    force: Flags.boolean({
      char: 'f',
      description: 'Skip confirmation prompt',
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(DaemonPurge);

    if (!flags.force) {
      const { default: confirm } = await import('@inquirer/confirm');
      const confirmed = await confirm({
        message: 'This will stop the daemon and delete all state. Continue?',
        default: false,
      });
      if (!confirmed) {
        this.log('Aborted.');
        return;
      }
    }

    const paths = getDaemonPaths(this.config.dataDir);

    const stopped = await stopDaemon(
      paths.socketPath,
      paths.pidPath,
      (message) => this.log(message),
    );

    if (!stopped) {
      this.error('Refusing to delete state while the daemon is still running.');
    }

    // Whitelist only the daemon-owned files rather than rm'ing the entire
    // oclif dataDir, which may hold unrelated state (caches, oclif lock
    // files, future config). `force: true` makes ENOENT a no-op for any
    // file already removed by stopDaemon.
    await Promise.all(
      [paths.pidPath, paths.socketPath, paths.logPath, paths.dbPath].map(
        async (path) => rm(path, { force: true }),
      ),
    );
    // Remove the SQLite sidecar files too (WAL/SHM are created in WAL mode).
    await Promise.all(
      [`${paths.dbPath}-wal`, `${paths.dbPath}-shm`].map(async (path) =>
        rm(path, { force: true }),
      ),
    );

    this.log('All daemon state deleted.');
  }
}
