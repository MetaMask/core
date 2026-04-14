import { isJsonRpcFailure } from '@metamask/utils';
import { Args, Command, Flags } from '@oclif/core';

import { sendCommand } from '../../daemon/daemon-client';
import { getDaemonPaths } from '../../daemon/paths';

export default class DaemonCall extends Command {
  static override description = 'Call a messenger action on the wallet daemon';

  static override examples = [
    '<%= config.bin %> daemon call AccountsController:listAccounts',
    '<%= config.bin %> daemon call NetworkController:getState',
    '<%= config.bin %> daemon call KeyringController:getState --timeout 10000',
  ];

  static override args = {
    action: Args.string({
      description:
        'The messenger action name (e.g. AccountsController:listAccounts)',
      required: true,
    }),
    params: Args.string({
      description: 'JSON-encoded arguments array (e.g. \'["arg1", "arg2"]\')',
      required: false,
    }),
  };

  static override flags = {
    timeout: Flags.integer({
      char: 't',
      description: 'Response timeout in milliseconds',
      required: false,
    }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(DaemonCall);
    const { action } = args;
    const timeoutMs = flags.timeout;

    // Build the params array for the `call` RPC method: [action, ...args]
    let rpcParams: unknown[] = [action];
    if (args.params !== undefined) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(args.params);
      } catch {
        this.error('params must be valid JSON');
      }

      if (!Array.isArray(parsed)) {
        this.error('params must be a JSON array');
      }

      rpcParams = [action, ...parsed];
    }

    const { socketPath } = getDaemonPaths(this.config.dataDir);

    const response = await sendCommand({
      socketPath,
      method: 'call',
      params: rpcParams,
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
    });

    if (isJsonRpcFailure(response)) {
      this.error(
        `${response.error.message} (code ${String(response.error.code)})`,
      );
    }

    const isTTY = process.stdout.isTTY ?? false;
    if (isTTY) {
      this.log(JSON.stringify(response.result, null, 2));
    } else {
      process.stdout.write(`${JSON.stringify(response.result)}\n`);
    }
  }
}
