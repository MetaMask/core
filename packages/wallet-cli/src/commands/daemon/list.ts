import { isJsonRpcFailure } from '@metamask/utils';
import { Command } from '@oclif/core';

import { sendCommand } from '../../daemon/daemon-client';
import { getDaemonPaths } from '../../daemon/paths';
import {
  formatJsonRpcError,
  isStringArray,
  makeDaemonConnectionError,
} from '../../daemon/utils';

export default class DaemonList extends Command {
  static override description =
    'List the messenger actions the running daemon can dispatch via `daemon call`';

  static override examples = ['<%= config.bin %> daemon list'];

  public async run(): Promise<void> {
    await this.parse(DaemonList);
    const { socketPath } = getDaemonPaths(this.config.dataDir);

    let response;
    try {
      response = await sendCommand({ socketPath, method: 'listActions' });
    } catch (error) {
      this.error(makeDaemonConnectionError(error));
    }

    if (isJsonRpcFailure(response)) {
      this.error(formatJsonRpcError(response.error));
    }

    if (!isStringArray(response.result)) {
      this.error('Daemon returned an unexpected action list.');
    }

    const actions = [...response.result].sort();

    const isTTY = process.stdout.isTTY ?? false;
    if (!isTTY) {
      // Bare output so it pipes cleanly into `grep`/`fzf`.
      if (actions.length > 0) {
        process.stdout.write(`${actions.join('\n')}\n`);
      }
      return;
    }

    if (actions.length === 0) {
      this.log('The daemon has no callable actions registered.');
      return;
    }

    this.log(
      `${actions.length} callable action${actions.length === 1 ? '' : 's'} ` +
        '(dispatch with `mm daemon call <action>`):',
    );
    for (const action of actions) {
      this.log(`  ${action}`);
    }
  }
}
