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

describe('stopDaemon', () => {
  beforeEach(() => {
    mockRm.mockResolvedValue(undefined);
  });

  it('returns true when daemon is not running (no PID file)', async () => {
    mockReadPidFile.mockResolvedValue(undefined);
    mockPingDaemon.mockResolvedValue(false);

    const result = await stopDaemon('/tmp/test.sock', '/tmp/test.pid');
    expect(result).toBe(true);
  });

  it('cleans up stale PID file when daemon is not running', async () => {
    mockReadPidFile.mockResolvedValue(123);
    mockIsProcessAlive.mockReturnValue(false);
    mockPingDaemon.mockResolvedValue(false);

    const result = await stopDaemon('/tmp/test.sock', '/tmp/test.pid');
    expect(result).toBe(true);
    expect(mockRm).toHaveBeenCalledWith('/tmp/test.pid', { force: true });
  });

  it('stops daemon via graceful RPC shutdown', async () => {
    mockReadPidFile.mockResolvedValue(123);
    mockIsProcessAlive.mockReturnValue(true);
    mockPingDaemon.mockResolvedValue(true);
    mockSendCommand.mockResolvedValue({
      jsonrpc: '2.0',
      id: '1',
      result: { status: 'shutting down' },
    });
    // Invoke the check callback for coverage, then return true
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
  });

  it('falls through to SIGTERM when graceful shutdown times out', async () => {
    mockReadPidFile.mockResolvedValue(123);
    mockIsProcessAlive.mockReturnValue(true);
    mockPingDaemon.mockResolvedValue(true);
    mockSendCommand.mockResolvedValue({
      jsonrpc: '2.0',
      id: '1',
      result: null,
    });
    mockSendSignal.mockReturnValue(true);
    // First waitFor (graceful) invokes cb and fails, second (SIGTERM) invokes cb and succeeds
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
    mockPingDaemon.mockResolvedValue(true);
    mockSendCommand.mockResolvedValue({
      jsonrpc: '2.0',
      id: '1',
      result: null,
    });
    mockSendSignal.mockReturnValue(true);
    // All three waitFor calls invoke check, graceful + SIGTERM fail, SIGKILL succeeds
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
  });

  it('returns false when all strategies fail', async () => {
    mockReadPidFile.mockResolvedValue(123);
    mockIsProcessAlive.mockReturnValue(true);
    mockPingDaemon.mockResolvedValue(true);
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

  it('treats ESRCH on SIGTERM as stopped', async () => {
    mockReadPidFile.mockResolvedValue(123);
    mockIsProcessAlive.mockReturnValue(true);
    mockPingDaemon.mockResolvedValue(false);
    mockSendSignal.mockReturnValue(false);

    const result = await stopDaemon('/tmp/test.sock', '/tmp/test.pid');
    expect(result).toBe(true);
  });

  it('treats ESRCH on SIGKILL as stopped', async () => {
    mockReadPidFile.mockResolvedValue(123);
    mockIsProcessAlive.mockReturnValue(true);
    mockPingDaemon.mockResolvedValue(false);
    // SIGTERM signal sent but process doesn't die, SIGKILL finds it gone
    mockSendSignal.mockReturnValueOnce(true).mockReturnValueOnce(false);
    mockWaitFor.mockResolvedValueOnce(false);

    const result = await stopDaemon('/tmp/test.sock', '/tmp/test.pid');
    expect(result).toBe(true);
    expect(mockSendSignal).toHaveBeenCalledWith(123, 'SIGKILL');
  });

  it('falls through to SIGKILL when SIGTERM throws EPERM', async () => {
    mockReadPidFile.mockResolvedValue(123);
    mockIsProcessAlive.mockReturnValue(true);
    mockPingDaemon.mockResolvedValue(false);
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
    mockPingDaemon.mockResolvedValue(false);
    mockSendSignal.mockImplementation(() => {
      throw Object.assign(new Error('eperm'), { code: 'EPERM' });
    });

    const result = await stopDaemon('/tmp/test.sock', '/tmp/test.pid');
    expect(result).toBe(false);
  });

  it('treats sendCommand error as socket unresponsive', async () => {
    mockReadPidFile.mockResolvedValue(123);
    mockIsProcessAlive.mockReturnValue(true);
    mockPingDaemon.mockResolvedValue(true);
    mockSendCommand.mockRejectedValue(new Error('socket error'));
    mockWaitFor.mockResolvedValue(true);

    const result = await stopDaemon('/tmp/test.sock', '/tmp/test.pid');
    expect(result).toBe(true);
  });
});
