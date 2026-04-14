import { Command, Flags } from '@oclif/core';

import { ensureDaemon } from '../../daemon/daemon-spawn';
import { getDaemonPaths } from '../../daemon/paths';

export default class DaemonStart extends Command {
  static override description = 'Start the wallet daemon';

  static override examples = [
    '<%= config.bin %> daemon start --infura-project-id <key> --password <pw> --srp <phrase>',
    'INFURA_PROJECT_ID=<key> MM_WALLET_PASSWORD=<pw> MM_WALLET_SRP=<phrase> <%= config.bin %> daemon start',
  ];

  // TODO: Delete unsafe flags
  static override flags = {
    'infura-project-id': Flags.string({
      description: 'Infura project ID for network access',
      env: 'INFURA_PROJECT_ID',
      required: true,
    }),
    password: Flags.string({
      description:
        'Wallet password (testing only — use MM_WALLET_PASSWORD env var in production)',
      env: 'MM_WALLET_PASSWORD',
      required: true,
    }),
    srp: Flags.string({
      description:
        'Secret recovery phrase (testing only — use MM_WALLET_SRP env var in production)',
      env: 'MM_WALLET_SRP',
      required: true,
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(DaemonStart);
    const infuraProjectId = flags['infura-project-id'];
    const { password, srp } = flags;

    await ensureDaemon({
      dataDir: this.config.dataDir,
      infuraProjectId,
      password,
      srp,
      packageRoot: this.config.root,
    });

    const { socketPath } = getDaemonPaths(this.config.dataDir);
    this.log(`Daemon running. Socket: ${socketPath}`);
  }
}
