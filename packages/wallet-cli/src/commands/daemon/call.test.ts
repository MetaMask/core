import { jest } from '@jest/globals';

import { sendCommand } from '../../daemon/daemon-client.js';
import { runCommand } from '../../test/run-command.js';
import DaemonCall from './call.js';

jest.mock('../../daemon/daemon-client');

const mockSendCommand = jest.mocked(sendCommand);

const ACTION = 'AccountsController:listAccounts';

describe('daemon call', () => {
  beforeEach(() => {
    mockSendCommand.mockResolvedValue({
      jsonrpc: '2.0',
      id: '1',
      result: { accounts: [] },
    });
  });

  it('dispatches the action with no params', async () => {
    await runCommand(DaemonCall, [ACTION]);

    expect(mockSendCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'call',
        params: [ACTION],
      }),
    );
  });

  it('parses a JSON-array params argument and appends to the params list', async () => {
    await runCommand(DaemonCall, [ACTION, '["arg1", 42]']);

    expect(mockSendCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'call',
        params: [ACTION, 'arg1', 42],
      }),
    );
  });

  it('errors when params is not valid JSON', async () => {
    const { error } = await runCommand(DaemonCall, [ACTION, 'not json']);

    expect(error?.message).toContain('valid JSON');
    expect(mockSendCommand).not.toHaveBeenCalled();
  });

  it('errors when params is JSON but not an array', async () => {
    const { error } = await runCommand(DaemonCall, [ACTION, '{"foo":1}']);

    expect(error?.message).toContain('JSON array');
    expect(mockSendCommand).not.toHaveBeenCalled();
  });

  it('passes the timeout flag through to sendCommand', async () => {
    await runCommand(DaemonCall, [ACTION, '--timeout', '5000']);

    expect(mockSendCommand).toHaveBeenCalledWith(
      expect.objectContaining({ timeoutMs: 5000 }),
    );
  });

  it('returns a friendly hint when the daemon is not running (ENOENT)', async () => {
    mockSendCommand.mockRejectedValue(
      Object.assign(new Error('no such file'), { code: 'ENOENT' }),
    );

    const { error } = await runCommand(DaemonCall, [ACTION]);

    expect(error?.message).toContain('Daemon is not running');
  });

  it('returns a friendly hint when the daemon refuses the connection', async () => {
    mockSendCommand.mockRejectedValue(
      Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }),
    );

    const { error } = await runCommand(DaemonCall, [ACTION]);

    expect(error?.message).toContain('Daemon is not running');
  });

  it('surfaces other socket errors with the raw message', async () => {
    mockSendCommand.mockRejectedValue(new Error('Socket read timed out'));

    const { error } = await runCommand(DaemonCall, [ACTION]);

    expect(error?.message).toContain('Socket read timed out');
  });

  it('handles non-Error throws from sendCommand', async () => {
    mockSendCommand.mockImplementation(async () =>
      Promise.reject('string error' as unknown as Error),
    );

    const { error } = await runCommand(DaemonCall, [ACTION]);

    expect(error?.message).toContain('string error');
  });

  it('errors when the daemon returns a JSON-RPC failure response', async () => {
    mockSendCommand.mockResolvedValue({
      jsonrpc: '2.0',
      id: '1',
      error: { code: -32601, message: 'Method not found' },
    });

    const { error } = await runCommand(DaemonCall, [ACTION]);

    expect(error?.message).toContain('Method not found');
    expect(error?.message).toContain('-32601');
  });

  it('writes pretty JSON to a TTY stdout', async () => {
    const original = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      configurable: true,
    });

    const { stdout } = await runCommand(DaemonCall, [ACTION]);

    expect(stdout).toContain('"accounts": []');

    Object.defineProperty(process.stdout, 'isTTY', {
      value: original,
      configurable: true,
    });
  });

  it('writes compact JSON to a piped (non-TTY) stdout', async () => {
    const original = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', {
      value: false,
      configurable: true,
    });
    const writeSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    await runCommand(DaemonCall, [ACTION]);

    expect(writeSpy).toHaveBeenCalledWith('{"accounts":[]}\n');

    writeSpy.mockRestore();
    Object.defineProperty(process.stdout, 'isTTY', {
      value: original,
      configurable: true,
    });
  });
});
