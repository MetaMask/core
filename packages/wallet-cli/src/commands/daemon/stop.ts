import { Command } from '@oclif/core';

import { getDaemonPaths } from '../../daemon/paths';
import { stopDaemon } from '../../daemon/stop-daemon';

export default class DaemonStop extends Command {
  static override description = 'Stop the wallet daemon';

  static override examples = ['<%= config.bin %> daemon stop'];

  public async run(): Promise<void> {
    const { socketPath, pidPath } = getDaemonPaths(this.config.dataDir);

    const stopped = await stopDaemon(socketPath, pidPath, (message) =>
      this.log(message),
    );

    if (!stopped) {
      this.error('Daemon did not stop within timeout.');
    }
  }
}
