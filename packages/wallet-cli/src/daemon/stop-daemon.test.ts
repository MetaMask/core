import { rm } from 'node:fs/promises';

import { pingDaemon, sendCommand } from './daemon-client';
import { stopDaemon } from './stop-daemon';
import { isProcessAlive, readPidFile, sendSignal, waitFor } from './utils';

jest.mock('node:fs/promises');
jest.mock('./daemon-client');
jest.mock('./utils');

const mockRm = jest.mocked(rm);
const mockPingDaemon = jest.mocked(pingDaemon);
const mockSendCommand = jest.mocked(sendCommand);
const mockReadPidFile = jest.mocked(readPidFile);
const mockIsProcessAlive = jest.mocked(isProcessAlive);
const mockSendSignal = jest.mocked(sendSignal);
const mockWaitFor = jest.mocked(waitFor);

const ABSENT = { status: 'absent' as const };
const RESPONSIVE = { status: 'responsive' as const };
const UNREACHABLE = {
  status: 'unreachable' as const,
  reason: 'refused' as const,
  error: new Error('refused'),
};

describe('stopDaemon', () => {
  beforeEach(() => {
    mockRm.mockResolvedValue(undefined);
    mockIsProcessAlive.mockReturnValue(false);
  });

  it('returns true when daemon is not running (no PID file)', async () => {
    mockReadPidFile.mockResolvedValue(undefined);
    mockPingDaemon.mockResolvedValue(ABSENT);

    const result = await stopDaemon('/tmp/test.sock', '/tmp/test.pid');
    expect(result).toBe(true);
  });

  it('cleans up stale PID file when daemon is not running', async () => {
    mockReadPidFile.mockResolvedValue(123);
    mockPingDaemon.mockResolvedValue(ABSENT);

    const result = await stopDaemon('/tmp/test.sock', '/tmp/test.pid');
    expect(result).toBe(true);
    expect(mockRm).toHaveBeenCalledWith('/tmp/test.pid', { force: true });
    // Critically: do NOT signal the recorded PID when the socket is absent
    // (PID may have been recycled to an unrelated process).
    expect(mockSendSignal).not.toHaveBeenCalled();
  });

  it('cleans up a stale socket and PID file when connections are refused and the process is dead', async () => {
    mockReadPidFile.mockResolvedValue(123);
    mockPingDaemon.mockResolvedValue(UNREACHABLE);
    mockIsProcessAlive.mockReturnValue(false);

    const result = await stopDaemon('/tmp/test.sock', '/tmp/test.pid');

    // A crashed daemon leaves a refused socket and PID file behind; the daemon
    // is gone, so report success and clear both.
    expect(result).toBe(true);
    expect(mockRm).toHaveBeenCalledWith('/tmp/test.pid', { force: true });
    expect(mockRm).toHaveBeenCalledWith('/tmp/test.sock', { force: true });
    // The recorded PID is dead, so never signal it — it may have been recycled.
    expect(mockSendSignal).not.toHaveBeenCalled();
    expect(mockSendCommand).not.toHaveBeenCalled();
  });

  it('does not delete the socket or report success when the socket is unreachable for a non-refused reason and the process is dead', async () => {
    mockReadPidFile.mockResolvedValue(123);
    mockPingDaemon.mockResolvedValue({
      status: 'unreachable',
      reason: 'permission',
      error: new Error('EACCES'),
    });
    mockIsProcessAlive.mockReturnValue(false);

    const result = await stopDaemon('/tmp/test.sock', '/tmp/test.pid');

    expect(result).toBe(false);
    expect(mockRm).not.toHaveBeenCalled();
    expect(mockSendSignal).not.toHaveBeenCalled();
  });

  it('signals the recorded PID when the socket is absent but the process is still alive', async () => {
    mockReadPidFile.mockResolvedValue(123);
    mockPingDaemon.mockResolvedValue(ABSENT);
    mockIsProcessAlive.mockReturnValue(true);
    mockSendSignal.mockReturnValue(true);
    mockWaitFor.mockResolvedValueOnce(true);

    const log = jest.fn();
    const result = await stopDaemon('/tmp/test.sock', '/tmp/test.pid', log);

    expect(result).toBe(true);
    expect(mockSendSignal).toHaveBeenCalledWith(123, 'SIGTERM');
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('Socket at /tmp/test.sock is absent'),
    );
  });

  it('stops daemon via graceful RPC shutdown', async () => {
    mockReadPidFile.mockResolvedValue(123);
    mockIsProcessAlive.mockReturnValue(true);
    mockPingDaemon.mockResolvedValue(RESPONSIVE);
    mockSendCommand.mockResolvedValue({
      jsonrpc: '2.0',
      id: '1',
      result: { status: 'shutting down' },
    });
    mockWaitFor.mockImplementation(async (check) => {
      await check();
      return true;
    });

    const log = jest.fn();
    const result = await stopDaemon('/tmp/test.sock', '/tmp/test.pid', log);

    expect(result).toBe(true);
    expect(mockSendCommand).toHaveBeenCalledWith({
      socketPath: '/tmp/test.sock',
      method: 'shutdown',
    });
    expect(log).toHaveBeenCalledWith('Stopping daemon...');
    expect(log).toHaveBeenCalledWith('Daemon stopped.');
    expect(mockRm).toHaveBeenCalledWith('/tmp/test.pid', { force: true });
    expect(mockRm).toHaveBeenCalledWith('/tmp/test.sock', { force: true });
  });

  it('falls through to SIGTERM when the socket goes quiet but the process is still alive', async () => {
    mockReadPidFile.mockResolvedValue(123);
    mockPingDaemon
      .mockResolvedValueOnce(RESPONSIVE) // entry: triggers graceful path
      .mockResolvedValue(ABSENT); // socket dropped after the shutdown RPC
    mockIsProcessAlive
      .mockReturnValueOnce(true) // entry snapshot
      .mockReturnValueOnce(true) // graceful re-check: still alive
      .mockReturnValue(false); // dies after SIGTERM
    mockSendCommand.mockResolvedValue({
      jsonrpc: '2.0',
      id: '1',
      result: { status: 'shutting down' },
    });
    mockSendSignal.mockReturnValue(true);
    mockWaitFor.mockImplementation(async (check) => check());

    const result = await stopDaemon('/tmp/test.sock', '/tmp/test.pid');

    expect(result).toBe(true);
    expect(mockSendSignal).toHaveBeenCalledWith(123, 'SIGTERM');
    expect(mockRm).toHaveBeenCalledWith('/tmp/test.sock', { force: true });
  });

  it('falls through to SIGTERM when graceful shutdown times out', async () => {
    mockReadPidFile.mockResolvedValue(123);
    mockIsProcessAlive.mockReturnValue(true);
    mockPingDaemon.mockResolvedValue(RESPONSIVE);
    mockSendCommand.mockResolvedValue({
      jsonrpc: '2.0',
      id: '1',
      result: null,
    });
    mockSendSignal.mockReturnValue(true);
    mockWaitFor
      .mockImplementationOnce(async (check) => {
        await check();
        return false;
      })
      .mockImplementationOnce(async (check) => {
        await check();
        return true;
      });

    const result = await stopDaemon('/tmp/test.sock', '/tmp/test.pid');
    expect(result).toBe(true);
    expect(mockSendSignal).toHaveBeenCalledWith(123, 'SIGTERM');
  });

  it('falls through to SIGKILL when SIGTERM times out', async () => {
    mockReadPidFile.mockResolvedValue(123);
    mockIsProcessAlive.mockReturnValue(true);
    mockPingDaemon.mockResolvedValue(RESPONSIVE);
    mockSendCommand.mockResolvedValue({
      jsonrpc: '2.0',
      id: '1',
      result: null,
    });
    mockSendSignal.mockReturnValue(true);
    mockWaitFor
      .mockImplementationOnce(async (check) => {
        await check();
        return false;
      })
      .mockImplementationOnce(async (check) => {
        await check();
        return false;
      })
      .mockImplementationOnce(async (check) => {
        await check();
        return true;
      });

    const result = await stopDaemon('/tmp/test.sock', '/tmp/test.pid');
    expect(result).toBe(true);
    expect(mockSendSignal).toHaveBeenCalledWith(123, 'SIGKILL');
    expect(mockRm).toHaveBeenCalledWith('/tmp/test.sock', { force: true });
  });

  it('returns false when all strategies fail', async () => {
    mockReadPidFile.mockResolvedValue(123);
    mockIsProcessAlive.mockReturnValue(true);
    mockPingDaemon.mockResolvedValue(RESPONSIVE);
    mockSendCommand.mockResolvedValue({
      jsonrpc: '2.0',
      id: '1',
      result: null,
    });
    mockSendSignal.mockReturnValue(true);
    mockWaitFor.mockResolvedValue(false);

    const result = await stopDaemon('/tmp/test.sock', '/tmp/test.pid');
    expect(result).toBe(false);
  });

  it('skips graceful shutdown when the socket is unreachable and signals directly', async () => {
    mockReadPidFile.mockResolvedValue(123);
    mockIsProcessAlive.mockReturnValue(true);
    mockPingDaemon.mockResolvedValue(UNREACHABLE);
    mockSendSignal.mockReturnValue(true);
    mockWaitFor.mockResolvedValueOnce(true);

    const result = await stopDaemon('/tmp/test.sock', '/tmp/test.pid');
    expect(result).toBe(true);
    expect(mockSendCommand).not.toHaveBeenCalled();
    expect(mockSendSignal).toHaveBeenCalledWith(123, 'SIGTERM');
  });

  it('treats ESRCH on SIGTERM as stopped', async () => {
    mockReadPidFile.mockResolvedValue(123);
    mockIsProcessAlive.mockReturnValue(true);
    mockPingDaemon.mockResolvedValue(UNREACHABLE);
    mockSendSignal.mockReturnValue(false);

    const result = await stopDaemon('/tmp/test.sock', '/tmp/test.pid');
    expect(result).toBe(true);
  });

  it('treats ESRCH on SIGKILL as stopped', async () => {
    mockReadPidFile.mockResolvedValue(123);
    mockIsProcessAlive.mockReturnValue(true);
    mockPingDaemon.mockResolvedValue(UNREACHABLE);
    mockSendSignal.mockReturnValueOnce(true).mockReturnValueOnce(false);
    mockWaitFor.mockResolvedValueOnce(false);

    const result = await stopDaemon('/tmp/test.sock', '/tmp/test.pid');
    expect(result).toBe(true);
    expect(mockSendSignal).toHaveBeenCalledWith(123, 'SIGKILL');
  });

  it('falls through to SIGKILL when SIGTERM throws EPERM', async () => {
    mockReadPidFile.mockResolvedValue(123);
    mockIsProcessAlive.mockReturnValue(true);
    mockPingDaemon.mockResolvedValue(UNREACHABLE);
    mockSendSignal
      .mockImplementationOnce(() => {
        throw Object.assign(new Error('eperm'), { code: 'EPERM' });
      })
      .mockReturnValueOnce(true);
    mockWaitFor.mockResolvedValueOnce(true);

    const result = await stopDaemon('/tmp/test.sock', '/tmp/test.pid');
    expect(result).toBe(true);
    expect(mockSendSignal).toHaveBeenCalledWith(123, 'SIGKILL');
  });

  it('returns false when both SIGTERM and SIGKILL throw EPERM', async () => {
    mockReadPidFile.mockResolvedValue(123);
    mockIsProcessAlive.mockReturnValue(true);
    mockPingDaemon.mockResolvedValue(UNREACHABLE);
    mockSendSignal.mockImplementation(() => {
      throw Object.assign(new Error('eperm'), { code: 'EPERM' });
    });

    const result = await stopDaemon('/tmp/test.sock', '/tmp/test.pid');
    expect(result).toBe(false);
  });

  it('treats sendCommand error as graceful shutdown failure and falls through', async () => {
    mockReadPidFile.mockResolvedValue(123);
    mockIsProcessAlive.mockReturnValue(true);
    mockPingDaemon.mockResolvedValue(RESPONSIVE);
    mockSendCommand.mockRejectedValue(new Error('socket error'));
    mockWaitFor.mockResolvedValue(true);

    const log = jest.fn();
    const result = await stopDaemon('/tmp/test.sock', '/tmp/test.pid', log);
    expect(result).toBe(true);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('Graceful shutdown request failed'),
    );
  });

  it('logs rather than throws when post-stop cleanup of the PID file fails', async () => {
    mockReadPidFile.mockResolvedValue(123);
    mockIsProcessAlive.mockReturnValue(true);
    mockPingDaemon.mockResolvedValue(RESPONSIVE);
    mockSendCommand.mockResolvedValue({
      jsonrpc: '2.0',
      id: '1',
      result: null,
    });
    mockWaitFor.mockResolvedValue(true);
    mockRm.mockImplementation((path) =>
      path === '/tmp/test.pid'
        ? Promise.reject(new Error('pid rm failed'))
        : Promise.resolve(undefined),
    );

    const log = jest.fn();
    const result = await stopDaemon('/tmp/test.sock', '/tmp/test.pid', log);
    expect(result).toBe(true);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('Failed to remove PID file'),
    );
  });

  it('logs rather than throws when post-stop cleanup of the socket file fails', async () => {
    mockReadPidFile.mockResolvedValue(123);
    mockIsProcessAlive.mockReturnValue(true);
    mockPingDaemon.mockResolvedValue(RESPONSIVE);
    mockSendCommand.mockResolvedValue({
      jsonrpc: '2.0',
      id: '1',
      result: null,
    });
    mockWaitFor.mockResolvedValue(true);
    mockRm.mockImplementation((path) =>
      path === '/tmp/test.sock'
        ? Promise.reject(new Error('socket rm failed'))
        : Promise.resolve(undefined),
    );

    const log = jest.fn();
    const result = await stopDaemon('/tmp/test.sock', '/tmp/test.pid', log);
    expect(result).toBe(true);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('Failed to remove socket file'),
    );
  });

  it('logs rather than throws when stale-PID cleanup fails', async () => {
    mockReadPidFile.mockResolvedValue(123);
    mockPingDaemon.mockResolvedValue(ABSENT);
    mockRm.mockRejectedValue(new Error('rm denied'));

    const log = jest.fn();
    const result = await stopDaemon('/tmp/test.sock', '/tmp/test.pid', log);
    expect(result).toBe(true);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('Failed to remove PID file'),
    );
  });
});
