import { Command } from '@oclif/core';

import { pingDaemon } from '../../daemon/daemon-client';
import { getDaemonPaths } from '../../daemon/paths';
import { stopDaemon } from '../../daemon/stop-daemon';
import { readPidFile } from '../../daemon/utils';

export default class DaemonStop extends Command {
  static override description = 'Stop the wallet daemon';

  static override examples = ['<%= config.bin %> daemon stop'];

  public async run(): Promise<void> {
    const { socketPath, pidPath } = getDaemonPaths(this.config.dataDir);

    const ping = await pingDaemon(socketPath);
    const pid = await readPidFile(pidPath);
    if (ping.status === 'absent' && pid === undefined) {
      this.log('Daemon is not running.');
      return;
    }

    const stopped = await stopDaemon(socketPath, pidPath, (message) =>
      this.log(message),
    );

    if (!stopped) {
      this.error('Daemon did not stop within timeout.');
    }
  }
}
