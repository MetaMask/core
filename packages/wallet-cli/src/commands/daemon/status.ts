import { isJsonRpcFailure } from '@metamask/utils';
import { Command } from '@oclif/core';

import { pingDaemon, sendCommand } from '../../daemon/daemon-client.js';
import { getDaemonPaths } from '../../daemon/paths.js';
import type { DaemonStatusInfo } from '../../daemon/types.js';
import { isProcessAlive, readPidFile } from '../../daemon/utils.js';

export default class DaemonStatus extends Command {
  static override description = 'Check the status of the wallet daemon';

  static override examples = ['<%= config.bin %> daemon status'];

  public async run(): Promise<void> {
    const { socketPath, pidPath } = getDaemonPaths(this.config.dataDir);

    const pid = await readPidFile(pidPath);
    const ping = await pingDaemon(socketPath);

    if (ping.status === 'absent') {
      // A missing socket alone does not prove the daemon is gone: stopDaemon
      // treats an absent socket plus an alive recorded PID as a daemon that
      // outlived its socket. Surface that orphan here rather than reporting a
      // clean "not running".
      if (pid !== undefined && isProcessAlive(pid)) {
        this.log(
          `Daemon socket is missing at ${socketPath} but recorded PID ${pid} is still alive. ` +
            `The daemon may be running without its socket; run \`mm daemon stop\` or \`mm daemon purge\`.`,
        );
        return;
      }
      this.log('Daemon is not running.');
      return;
    }

    if (ping.status === 'unreachable') {
      const pidPart = pid === undefined ? '' : ` (recorded PID: ${pid})`;
      this.log(
        `Daemon socket exists at ${socketPath} but is unresponsive${pidPart} ` +
          `[${ping.reason}]: ${ping.error.message}`,
      );
      return;
    }

    let response;
    try {
      response = await sendCommand({
        socketPath,
        method: 'getStatus',
        timeoutMs: 5_000,
      });
    } catch (error) {
      this.log(
        `Daemon socket is responsive but status request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }

    if (isJsonRpcFailure(response)) {
      this.log(
        `Daemon is running but returned an error: ${response.error.message}`,
      );
      return;
    }

    const status = response.result as DaemonStatusInfo;
    if (pid !== undefined && pid !== status.pid) {
      this.log(
        `Warning: PID file records ${pid} but the running daemon reports ${status.pid}. ` +
          `Local state may be stale; consider \`mm daemon purge\`.`,
      );
    }
    this.log(
      `Daemon is running. PID: ${status.pid}, Uptime: ${status.uptime}s`,
    );
  }
}
