import { Command, Flags } from '@oclif/core';
import { rm } from 'node:fs/promises';

import { getDaemonPaths } from '../../daemon/paths';
import { stopDaemon } from '../../daemon/stop-daemon';

export default class DaemonPurge extends Command {
  static override description =
    'Stop the daemon and delete all daemon state files';

  static override examples = ['<%= config.bin %> daemon purge --force'];

  static override flags = {
    force: Flags.boolean({
      char: 'f',
      description: 'Required to confirm purge',
      required: true,
    }),
  };

  public async run(): Promise<void> {
    await this.parse(DaemonPurge);

    const { socketPath, pidPath, logPath } = getDaemonPaths(
      this.config.dataDir,
    );

    const stopped = await stopDaemon(socketPath, pidPath, (message) =>
      this.log(message),
    );

    if (!stopped) {
      this.error('Refusing to delete state while the daemon is still running.');
    }

    await Promise.all([
      rm(socketPath, { force: true }),
      rm(pidPath, { force: true }),
      rm(logPath, { force: true }),
    ]);

    this.log('All daemon state deleted.');
  }
}
