import { Command, Flags } from '@oclif/core';
import { rm } from 'node:fs/promises';

import { pingDaemon } from '../../daemon/daemon-client';
import { getDaemonPaths } from '../../daemon/paths';
import { confirmPurge } from '../../daemon/prompts';
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
      const confirmed = await confirmPurge();
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
      // Purge is the escape hatch for a daemon that wouldn't shut down cleanly,
      // so proceed once we've confirmed it isn't responsive — deleting state
      // out from under a live daemon would risk corrupting it.
      const ping = await pingDaemon(paths.socketPath);
      if (ping.status === 'responsive') {
        this.error(
          'Refusing to delete state while the daemon is still responsive.',
        );
      }
      this.log(
        'Could not confirm clean shutdown; proceeding to delete state anyway.',
      );
    }

    // Whitelist only the daemon-owned files rather than rm'ing the entire
    // oclif dataDir, which may hold unrelated state (caches, oclif lock
    // files, future config). `force: true` makes ENOENT a no-op for any
    // file already removed by stopDaemon.
    await Promise.all(
      [
        paths.pidPath,
        paths.socketPath,
        paths.logPath,
        paths.dbPath,
        `${paths.dbPath}-wal`,
        `${paths.dbPath}-shm`,
      ].map(async (path) => rm(path, { force: true })),
    );

    this.log('All daemon state deleted.');
  }
}
