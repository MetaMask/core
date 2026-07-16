import { jest } from '@jest/globals';

import { sendCommand } from '../../daemon/daemon-client.js';
import { runCommand } from '../../test/run-command.js';
import DaemonList from './list.js';

jest.mock('../../daemon/daemon-client');

const mockSendCommand = jest.mocked(sendCommand);

/**
 * Force `process.stdout.isTTY` for the duration of `fn`, restoring it after.
 *
 * @param value - The value to assign to `process.stdout.isTTY`.
 * @param fn - The callback to run while the override is in place.
 */
async function withTTY(
  value: boolean | undefined,
  fn: () => Promise<void>,
): Promise<void> {
  const original = process.stdout.isTTY;
  Object.defineProperty(process.stdout, 'isTTY', {
    value,
    configurable: true,
  });
  try {
    await fn();
  } finally {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: original,
      configurable: true,
    });
  }
}

describe('daemon list', () => {
  beforeEach(() => {
    mockSendCommand.mockResolvedValue({
      jsonrpc: '2.0',
      id: '1',
      result: ['NetworkController:getState', 'KeyringController:getState'],
    });
  });

  it('requests the listActions method', async () => {
    await withTTY(true, async () => {
      await runCommand(DaemonList);
    });

    expect(mockSendCommand).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'listActions' }),
    );
  });

  it('prints a sorted, indented action list with a count header to a TTY', async () => {
    await withTTY(true, async () => {
      const { stdout } = await runCommand(DaemonList);

      expect(stdout).toContain('2 callable actions');
      expect(stdout).toContain('mm daemon call <action>');
      // Sorted: KeyringController before NetworkController.
      expect(stdout.indexOf('KeyringController:getState')).toBeLessThan(
        stdout.indexOf('NetworkController:getState'),
      );
      expect(stdout).toContain('  KeyringController:getState');
    });
  });

  it('singularizes the header for a single action', async () => {
    mockSendCommand.mockResolvedValue({
      jsonrpc: '2.0',
      id: '1',
      result: ['KeyringController:getState'],
    });

    await withTTY(true, async () => {
      const { stdout } = await runCommand(DaemonList);

      expect(stdout).toContain('1 callable action ');
    });
  });

  it('reports an empty registry to a TTY', async () => {
    mockSendCommand.mockResolvedValue({ jsonrpc: '2.0', id: '1', result: [] });

    await withTTY(true, async () => {
      const { stdout } = await runCommand(DaemonList);

      expect(stdout).toContain('no callable actions');
    });
  });

  it('writes a bare, sorted, newline-delimited list to a pipe (non-TTY)', async () => {
    const writeSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    await withTTY(false, async () => {
      await runCommand(DaemonList);
    });

    expect(writeSpy).toHaveBeenCalledWith(
      'KeyringController:getState\nNetworkController:getState\n',
    );
    writeSpy.mockRestore();
  });

  it('sorts actions lexicographically, including within a shared namespace', async () => {
    mockSendCommand.mockResolvedValue({
      jsonrpc: '2.0',
      id: '1',
      result: [
        'KeyringController:getState',
        'AccountsController:listMultichainAccounts',
        'KeyringController:addNewAccount',
      ],
    });
    const writeSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    await withTTY(false, async () => {
      await runCommand(DaemonList);
    });

    expect(writeSpy).toHaveBeenCalledWith(
      'AccountsController:listMultichainAccounts\n' +
        'KeyringController:addNewAccount\n' +
        'KeyringController:getState\n',
    );
    writeSpy.mockRestore();
  });

  it('treats an undefined isTTY as non-TTY', async () => {
    const writeSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    await withTTY(undefined, async () => {
      await runCommand(DaemonList);
    });

    expect(writeSpy).toHaveBeenCalledWith(
      'KeyringController:getState\nNetworkController:getState\n',
    );
    writeSpy.mockRestore();
  });

  it('writes nothing to a pipe when the registry is empty', async () => {
    mockSendCommand.mockResolvedValue({ jsonrpc: '2.0', id: '1', result: [] });
    const writeSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    await withTTY(false, async () => {
      await runCommand(DaemonList);
    });

    expect(writeSpy).not.toHaveBeenCalled();
    writeSpy.mockRestore();
  });

  it('returns a friendly hint when the daemon is not running (ENOENT)', async () => {
    mockSendCommand.mockRejectedValue(
      Object.assign(new Error('no such file'), { code: 'ENOENT' }),
    );

    const { error } = await runCommand(DaemonList);

    expect(error?.message).toContain('Daemon is not running');
  });

  it('returns a friendly hint when the daemon refuses the connection', async () => {
    mockSendCommand.mockRejectedValue(
      Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }),
    );

    const { error } = await runCommand(DaemonList);

    expect(error?.message).toContain('Daemon is not running');
  });

  it('surfaces other socket errors with the raw message', async () => {
    mockSendCommand.mockRejectedValue(new Error('Socket read timed out'));

    const { error } = await runCommand(DaemonList);

    expect(error?.message).toContain('Socket read timed out');
  });

  it('handles non-Error throws from sendCommand', async () => {
    mockSendCommand.mockImplementation(async () =>
      Promise.reject('string error' as unknown as Error),
    );

    const { error } = await runCommand(DaemonList);

    expect(error?.message).toContain('string error');
  });

  it('errors when the daemon returns a JSON-RPC failure response', async () => {
    mockSendCommand.mockResolvedValue({
      jsonrpc: '2.0',
      id: '1',
      error: { code: -32601, message: 'Method not found' },
    });

    const { error } = await runCommand(DaemonList);

    expect(error?.message).toContain('Method not found');
    expect(error?.message).toContain('-32601');
  });

  it('errors when the result is not an array of strings', async () => {
    mockSendCommand.mockResolvedValue({
      jsonrpc: '2.0',
      id: '1',
      result: { not: 'an array' },
    });

    const { error } = await runCommand(DaemonList);

    expect(error?.message).toContain('unexpected action list');
  });
});
