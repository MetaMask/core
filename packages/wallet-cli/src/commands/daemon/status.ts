import { isJsonRpcFailure } from '@metamask/utils';
import { Command } from '@oclif/core';

import { pingDaemon, sendCommand } from '../../daemon/daemon-client';
import { getDaemonPaths } from '../../daemon/paths';
import { isProcessAlive, readPidFile } from '../../daemon/utils';

export default class DaemonStatus extends Command {
  static override description = 'Check the status of the wallet daemon';

  static override examples = ['<%= config.bin %> daemon status'];

  public async run(): Promise<void> {
    const { socketPath, pidPath } = getDaemonPaths(this.config.dataDir);

    const pid = await readPidFile(pidPath);
    const processAlive = pid !== undefined && isProcessAlive(pid);
    const socketResponsive = await pingDaemon(socketPath);

    if (!processAlive && !socketResponsive) {
      this.log('Daemon is not running.');
      return;
    }

    if (processAlive && !socketResponsive) {
      this.log(
        `Daemon process exists (PID: ${pid}) but socket is not responding.`,
      );
      return;
    }

    const response = await sendCommand({
      socketPath,
      method: 'getStatus',
      timeoutMs: 5_000,
    });

    if (isJsonRpcFailure(response)) {
      this.log(
        `Daemon is running but returned an error: ${response.error.message}`,
      );
      return;
    }

    const status = response.result as { pid: number; uptime: number };
    this.log(
      `Daemon is running. PID: ${status.pid}, Uptime: ${status.uptime}s`,
    );
  }
}
