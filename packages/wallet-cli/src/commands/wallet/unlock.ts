import { isJsonRpcFailure } from '@metamask/utils';
import { Command, Flags } from '@oclif/core';

import { sendCommand } from '../../daemon/daemon-client';
import { getDaemonPaths } from '../../daemon/paths';
import { promptPassword } from '../../daemon/prompts';
import { isErrorWithCode } from '../../daemon/utils';

export default class WalletUnlock extends Command {
  static override description =
    'Unlock the wallet (submits the password to KeyringController). ' +
    'Use this after `mm daemon start` was run without `--password`, or ' +
    'after the keyring was locked via `KeyringController:setLocked`.';

  static override examples = [
    '<%= config.bin %> wallet unlock --password <pw>',
    'MM_WALLET_PASSWORD=<pw> <%= config.bin %> wallet unlock',
    '<%= config.bin %> wallet unlock   # prompts interactively',
  ];

  static override flags = {
    password: Flags.string({
      description:
        'Wallet password (testing only — use MM_WALLET_PASSWORD env var in production). ' +
        'When omitted, the command prompts interactively.',
      env: 'MM_WALLET_PASSWORD',
      required: false,
    }),
    timeout: Flags.integer({
      char: 't',
      description: 'Response timeout in milliseconds',
      required: false,
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(WalletUnlock);
    const { timeout: timeoutMs } = flags;

    // Empty `--password ''` or empty `MM_WALLET_PASSWORD` env var means "no
    // password supplied", not "the empty string is the password" —
    // collapsing the ambiguity here so the prompt fires instead of sending
    // an empty string the controller will reject.
    const flagPassword =
      flags.password === undefined || flags.password === ''
        ? undefined
        : flags.password;
    const password = flagPassword ?? (await promptPassword());

    const { socketPath } = getDaemonPaths(this.config.dataDir);

    let response;
    try {
      response = await sendCommand({
        socketPath,
        method: 'call',
        params: ['KeyringController:submitPassword', password],
        ...(timeoutMs === undefined ? {} : { timeoutMs }),
      });
    } catch (error) {
      if (
        isErrorWithCode(error, 'ENOENT') ||
        isErrorWithCode(error, 'ECONNREFUSED')
      ) {
        this.error('Daemon is not running. Start it with `mm daemon start`.');
      }
      if (isErrorWithCode(error, 'EACCES')) {
        this.error(
          `Cannot connect to the daemon socket: permission denied. ` +
            `The socket may be owned by another user, or MM_DAEMON_DATA_DIR ` +
            `may point to a directory you cannot access.`,
        );
      }
      this.error(error instanceof Error ? error.message : String(error));
    }

    if (isJsonRpcFailure(response)) {
      const { code, message, data } = response.error;
      // `isJsonRpcFailure` already validates that `data` is JSON, so
      // `JSON.stringify` cannot throw here.
      const dataSuffix =
        data === undefined ? '' : ` data=${JSON.stringify(data)}`;
      this.error(
        `Failed to unlock: ${message} (code ${String(code)})${dataSuffix}`,
      );
    }

    this.log('Wallet unlocked.');
  }
}
