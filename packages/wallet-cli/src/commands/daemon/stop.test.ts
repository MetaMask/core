import { pingDaemon } from '../../daemon/daemon-client';
import { stopDaemon } from '../../daemon/stop-daemon';
import { readPidFile } from '../../daemon/utils';
import { runCommand } from '../../test/run-command';
import DaemonStop from './stop';

jest.mock('../../daemon/daemon-client');
jest.mock('../../daemon/stop-daemon');
jest.mock('../../daemon/utils');

const mockPingDaemon = jest.mocked(pingDaemon);
const mockStopDaemon = jest.mocked(stopDaemon);
const mockReadPidFile = jest.mocked(readPidFile);

describe('daemon stop', () => {
  it('reports "Daemon is not running" when no socket and no PID file exist', async () => {
    mockPingDaemon.mockResolvedValue({ status: 'absent' });
    mockReadPidFile.mockResolvedValue(undefined);

    const { stdout, error } = await runCommand(DaemonStop);

    expect(stdout).toContain('Daemon is not running.');
    expect(mockStopDaemon).not.toHaveBeenCalled();
    expect(error).toBeUndefined();
  });

  it('invokes stopDaemon when a PID file exists even if the socket is absent', async () => {
    mockPingDaemon.mockResolvedValue({ status: 'absent' });
    mockReadPidFile.mockResolvedValue(12345);
    mockStopDaemon.mockResolvedValue(true);

    const { error } = await runCommand(DaemonStop);

    expect(mockStopDaemon).toHaveBeenCalled();
    expect(error).toBeUndefined();
  });

  it('invokes stopDaemon when the socket is responsive', async () => {
    mockPingDaemon.mockResolvedValue({ status: 'responsive' });
    mockReadPidFile.mockResolvedValue(12345);
    mockStopDaemon.mockResolvedValue(true);

    const { error } = await runCommand(DaemonStop);

    expect(mockStopDaemon).toHaveBeenCalled();
    expect(error).toBeUndefined();
  });

  it('threads its log callback into stopDaemon so daemon-side messages reach the user', async () => {
    mockPingDaemon.mockResolvedValue({ status: 'responsive' });
    mockReadPidFile.mockResolvedValue(12345);
    mockStopDaemon.mockImplementation(async (_socket, _pid, log) => {
      log?.('Stopping daemon...');
      return true;
    });

    const { stdout } = await runCommand(DaemonStop);

    expect(stdout).toContain('Stopping daemon...');
  });

  it('errors when stopDaemon returns false', async () => {
    mockPingDaemon.mockResolvedValue({ status: 'responsive' });
    mockReadPidFile.mockResolvedValue(12345);
    mockStopDaemon.mockResolvedValue(false);

    const { error } = await runCommand(DaemonStop);

    expect(error?.message).toContain('did not stop within timeout');
  });
});
