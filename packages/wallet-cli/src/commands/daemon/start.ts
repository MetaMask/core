import { Command, Flags } from '@oclif/core';

import { ensureDaemon } from '../../daemon/daemon-spawn';
import { Password, Srp } from '../../daemon/secrets';

export default class DaemonStart extends Command {
  static override description = 'Start the wallet daemon';

  static override examples = [
    '<%= config.bin %> daemon start --infura-project-id <key> --password <pw> --srp <phrase>',
    'INFURA_PROJECT_ID=<key> MM_WALLET_PASSWORD=<pw> MM_WALLET_SRP=<phrase> <%= config.bin %> daemon start',
    '<%= config.bin %> daemon start --infura-project-id <key> --srp <phrase>   # then `mm wallet unlock` later',
  ];

  static override flags = {
    'infura-project-id': Flags.string({
      description: 'Infura project ID for network access',
      env: 'INFURA_PROJECT_ID',
      required: true,
    }),
    password: Flags.string({
      description:
        'Wallet password (testing only — use MM_WALLET_PASSWORD env var in production). ' +
        'Required on first run; on subsequent runs, omit (and leave MM_WALLET_PASSWORD unset) to start with a locked keyring and use `mm wallet unlock`.',
      env: 'MM_WALLET_PASSWORD',
      required: false,
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
    const password = flags.password ? Password.from(flags.password) : undefined;
    const srp = Srp.from(flags.srp);

    const { state, socketPath } = await ensureDaemon({
      dataDir: this.config.dataDir,
      infuraProjectId,
      password,
      srp,
      packageRoot: this.config.root,
    });

    if (state === 'already-running') {
      this.log(
        `Daemon already running. Socket: ${socketPath}. ` +
          `The provided flags were not applied; run \`mm daemon stop\` and start again to change them.`,
      );
      return;
    }

    this.log(`Daemon running. Socket: ${socketPath}`);
  }
}
