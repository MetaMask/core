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

    const { socketPath, pidPath } = getDaemonPaths(this.config.dataDir);

    const stopped = await stopDaemon(socketPath, pidPath, (message) =>
      this.log(message),
    );

    if (!stopped) {
      this.error('Refusing to delete state while the daemon is still running.');
    }

    await rm(this.config.dataDir, { recursive: true, force: true });

    this.log('All daemon state deleted.');
  }
}
