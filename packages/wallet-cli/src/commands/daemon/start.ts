import { Command, Flags } from '@oclif/core';

import { ensureDaemon } from '../../daemon/daemon-spawn';
import { getDaemonPaths } from '../../daemon/paths';

export default class DaemonStart extends Command {
  static override description = 'Start the wallet daemon';

  static override examples = [
    '<%= config.bin %> daemon start --infura-project-id <key>',
    'INFURA_PROJECT_ID=<key> <%= config.bin %> daemon start',
  ];

  static override flags = {
    'infura-project-id': Flags.string({
      description: 'Infura project ID for network access',
      env: 'INFURA_PROJECT_ID',
      required: true,
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(DaemonStart);
    const infuraProjectId = flags['infura-project-id'];

    const { logPath, socketPath } = getDaemonPaths(this.config.dataDir);

    await ensureDaemon(socketPath, {
      dataDir: this.config.dataDir,
      socketPath,
      logPath,
      infuraProjectId,
      packageRoot: this.config.root,
    });

    this.log(`Daemon running. Socket: ${socketPath}`);
  }
}
