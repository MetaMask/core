import type { Json } from '@metamask/utils';
import { isJsonRpcFailure } from '@metamask/utils';
import { Command } from '@oclif/core';

import { sendCommand } from '../../daemon/daemon-client';
import { getDaemonPaths } from '../../daemon/paths';
import { isErrorWithCode } from '../../daemon/utils';

/**
 * Narrow an RPC result to the `string[]` the daemon's `listActions` returns.
 *
 * @param value - The `result` field of the JSON-RPC response.
 * @returns True if the value is an array of strings.
 */
function isStringArray(value: Json): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === 'string')
  );
}

export default class DaemonList extends Command {
  static override description =
    'List the messenger actions the running daemon can dispatch via `daemon call`';

  static override examples = ['<%= config.bin %> daemon list'];

  public async run(): Promise<void> {
    const { socketPath } = getDaemonPaths(this.config.dataDir);

    let response;
    try {
      response = await sendCommand({ socketPath, method: 'listActions' });
    } catch (error) {
      if (
        isErrorWithCode(error, 'ENOENT') ||
        isErrorWithCode(error, 'ECONNREFUSED')
      ) {
        this.error('Daemon is not running. Start it with `mm daemon start`.');
      }
      this.error(error instanceof Error ? error.message : String(error));
    }

    if (isJsonRpcFailure(response)) {
      this.error(
        `${response.error.message} (code ${String(response.error.code)})`,
      );
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
