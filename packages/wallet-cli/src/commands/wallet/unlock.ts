import { isJsonRpcFailure } from '@metamask/utils';
import { Command, Flags } from '@oclif/core';

import { sendCommand } from '../../daemon/daemon-client.js';
import { getDaemonPaths } from '../../daemon/paths.js';
import { promptPassword } from '../../daemon/prompts.js';
import {
  emptyToUndefined,
  makeDaemonConnectionError,
} from '../../daemon/utils.js';

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

    // `emptyToUndefined` collapses `--password ''` and `MM_WALLET_PASSWORD=''`
    // to undefined so the prompt fires instead of sending an empty string.
    const flagPassword = emptyToUndefined(flags.password);
    let password: string;
    try {
      password = flagPassword ?? (await promptPassword());
    } catch (error) {
      // Only swallow ExitPromptError (@inquirer/core's Ctrl+C signal); any
      // other rejection (import failure, internal prompt crash) should surface.
      if (error instanceof Error && error.name === 'ExitPromptError') {
        return;
      }
      throw error;
    }

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
      this.error(makeDaemonConnectionError(error));
    }

    if (isJsonRpcFailure(response)) {
      const { code, message, data } = response.error;
      // `isJsonRpcFailure` already validates that `data` is JSON, so
      // `JSON.stringify` cannot throw here.
      const dataSuffix =
        data === undefined || data === null
          ? ''
          : ` data=${JSON.stringify(data)}`;
      this.error(
        `Failed to unlock: ${message} (code ${String(code)})${dataSuffix}`,
      );
    }

    this.log('Wallet unlocked.');
  }
}
