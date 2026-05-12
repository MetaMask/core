import { Command, Flags } from '@oclif/core';
import { rm } from 'node:fs/promises';

import { pingDaemon } from '../../daemon/daemon-client';
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
      // `stopDaemon` returns false when it couldn't be sure the daemon
      // exited — typically because the socket exists but the daemon never
      // responded to signals, or because the PID file is stale and the
      // socket is orphan. Purge is the user's escape hatch for exactly
      // these states, so as long as the daemon is not currently
      // responsive, we proceed with the deletion the user already
      // confirmed. If the daemon IS responsive, we still refuse — that
      // would risk corrupting live state.
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
