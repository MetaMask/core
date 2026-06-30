import { pingDaemon, sendCommand } from '../../daemon/daemon-client';
import { isProcessAlive, readPidFile } from '../../daemon/utils';
import { runCommand } from '../../test/run-command';
import DaemonStatus from './status';

jest.mock('../../daemon/daemon-client');
jest.mock('../../daemon/utils');

const mockPingDaemon = jest.mocked(pingDaemon);
const mockSendCommand = jest.mocked(sendCommand);
const mockReadPidFile = jest.mocked(readPidFile);
const mockIsProcessAlive = jest.mocked(isProcessAlive);

describe('daemon status', () => {
  beforeEach(() => {
    mockReadPidFile.mockResolvedValue(12345);
    mockIsProcessAlive.mockReturnValue(false);
  });

  it('reports "not running" when the socket is absent and the recorded PID is dead', async () => {
    mockPingDaemon.mockResolvedValue({ status: 'absent' });

    const { stdout } = await runCommand(DaemonStatus);

    expect(stdout).toContain('Daemon is not running.');
  });

  it('reports "not running" when the socket is absent and no PID file exists', async () => {
    mockReadPidFile.mockResolvedValue(undefined);
    mockPingDaemon.mockResolvedValue({ status: 'absent' });

    const { stdout } = await runCommand(DaemonStatus);

    expect(stdout).toContain('Daemon is not running.');
    expect(mockIsProcessAlive).not.toHaveBeenCalled();
  });

  it('reports a possible orphan when the socket is absent but the recorded PID is alive', async () => {
    mockPingDaemon.mockResolvedValue({ status: 'absent' });
    mockIsProcessAlive.mockReturnValue(true);

    const { stdout } = await runCommand(DaemonStatus);

    expect(stdout).not.toContain('Daemon is not running.');
    expect(stdout).toContain('recorded PID 12345 is still alive');
    expect(mockIsProcessAlive).toHaveBeenCalledWith(12345);
  });

  it('reports the unreachable reason and recorded PID', async () => {
    mockPingDaemon.mockResolvedValue({
      status: 'unreachable',
      reason: 'refused',
      error: new Error('ECONNREFUSED'),
    });

    const { stdout } = await runCommand(DaemonStatus);

    expect(stdout).toContain('is unresponsive');
    expect(stdout).toContain('recorded PID: 12345');
    expect(stdout).toContain('[refused]');
    expect(stdout).toContain('ECONNREFUSED');
  });

  it('omits the PID suffix when no PID file is present', async () => {
    mockReadPidFile.mockResolvedValue(undefined);
    mockPingDaemon.mockResolvedValue({
      status: 'unreachable',
      reason: 'timeout',
      error: new Error('timeout'),
    });

    const { stdout } = await runCommand(DaemonStatus);

    expect(stdout).toContain('is unresponsive');
    expect(stdout).not.toContain('recorded PID');
  });

  it('reports a status-request failure distinctly from an absent or unreachable daemon', async () => {
    mockPingDaemon.mockResolvedValue({ status: 'responsive' });
    mockSendCommand.mockRejectedValue(new Error('timed out'));

    const { stdout } = await runCommand(DaemonStatus);

    expect(stdout).toContain('responsive but status request failed');
    expect(stdout).toContain('timed out');
  });

  it('reports a JSON-RPC error response from getStatus', async () => {
    mockPingDaemon.mockResolvedValue({ status: 'responsive' });
    mockSendCommand.mockResolvedValue({
      jsonrpc: '2.0',
      id: '1',
      error: { code: -32000, message: 'boom' },
    });

    const { stdout } = await runCommand(DaemonStatus);

    expect(stdout).toContain('returned an error: boom');
  });

  it('reports PID and uptime on success', async () => {
    mockPingDaemon.mockResolvedValue({ status: 'responsive' });
    mockSendCommand.mockResolvedValue({
      jsonrpc: '2.0',
      id: '1',
      result: { pid: 12345, uptime: 42 },
    });

    const { stdout } = await runCommand(DaemonStatus);

    expect(stdout).toContain('PID: 12345, Uptime: 42s');
  });

  it('warns when the local PID file disagrees with the running daemon', async () => {
    mockReadPidFile.mockResolvedValue(99999);
    mockPingDaemon.mockResolvedValue({ status: 'responsive' });
    mockSendCommand.mockResolvedValue({
      jsonrpc: '2.0',
      id: '1',
      result: { pid: 12345, uptime: 42 },
    });

    const { stdout } = await runCommand(DaemonStatus);

    expect(stdout).toContain(
      'Warning: PID file records 99999 but the running daemon reports 12345',
    );
  });

  it('handles non-Error throws from sendCommand', async () => {
    mockPingDaemon.mockResolvedValue({ status: 'responsive' });
    mockSendCommand.mockImplementation(async () =>
      Promise.reject('string error' as unknown as Error),
    );

    const { stdout } = await runCommand(DaemonStatus);

    expect(stdout).toContain('status request failed: string error');
  });
});
