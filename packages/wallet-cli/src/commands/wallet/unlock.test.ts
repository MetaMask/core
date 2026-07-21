import { jest } from '@jest/globals';

import { sendCommand } from '../../daemon/daemon-client.js';
import { promptPassword } from '../../daemon/prompts.js';
import { runCommand } from '../../test/run-command.js';
import WalletUnlock from './unlock.js';

jest.mock('../../daemon/daemon-client');
jest.mock('../../daemon/prompts');

const mockSendCommand = jest.mocked(sendCommand);
const mockPromptPassword = jest.mocked(promptPassword);

const SUCCESS_FLAGS = ['--password', 'pw'];

describe('wallet unlock', () => {
  beforeEach(() => {
    mockSendCommand.mockResolvedValue({
      jsonrpc: '2.0',
      id: '1',
      result: null,
    });
  });

  it('dispatches KeyringController:submitPassword with the password', async () => {
    await runCommand(WalletUnlock, SUCCESS_FLAGS);

    expect(mockSendCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'call',
        params: ['KeyringController:submitPassword', 'pw'],
      }),
    );
    expect(mockPromptPassword).not.toHaveBeenCalled();
  });

  it('reports success on a non-error response', async () => {
    const { stdout } = await runCommand(WalletUnlock, SUCCESS_FLAGS);

    expect(stdout).toContain('Wallet unlocked.');
  });

  it('passes the timeout flag through to sendCommand', async () => {
    await runCommand(WalletUnlock, [...SUCCESS_FLAGS, '--timeout', '5000']);

    expect(mockSendCommand).toHaveBeenCalledWith(
      expect.objectContaining({ timeoutMs: 5000 }),
    );
  });

  it('reads the password from MM_WALLET_PASSWORD when the flag is absent', async () => {
    // Snapshot+restore the whole env via assignment so the await between
    // mutation and restore does not trip `require-atomic-updates`.
    const savedEnv = process.env;
    process.env = { ...savedEnv, MM_WALLET_PASSWORD: 'from-env' };
    try {
      await runCommand(WalletUnlock, []);
    } finally {
      // Restoring after await is intentional; jest runs each test serially.
      // eslint-disable-next-line require-atomic-updates
      process.env = savedEnv;
    }

    expect(mockSendCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        params: ['KeyringController:submitPassword', 'from-env'],
      }),
    );
    expect(mockPromptPassword).not.toHaveBeenCalled();
  });

  it('prompts interactively when neither flag nor env is supplied', async () => {
    const savedEnv = process.env;
    process.env = { ...savedEnv };
    delete process.env.MM_WALLET_PASSWORD;
    mockPromptPassword.mockResolvedValue('typed-by-user');
    try {
      await runCommand(WalletUnlock, []);
    } finally {
      // eslint-disable-next-line require-atomic-updates
      process.env = savedEnv;
    }

    expect(mockPromptPassword).toHaveBeenCalledTimes(1);
    expect(mockSendCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        params: ['KeyringController:submitPassword', 'typed-by-user'],
      }),
    );
  });

  it('prompts interactively when --password is supplied with an empty value', async () => {
    mockPromptPassword.mockResolvedValue('typed-by-user');

    await runCommand(WalletUnlock, ['--password', '']);

    expect(mockPromptPassword).toHaveBeenCalledTimes(1);
    expect(mockSendCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        params: ['KeyringController:submitPassword', 'typed-by-user'],
      }),
    );
  });

  it('prompts interactively when MM_WALLET_PASSWORD is set to an empty string', async () => {
    const savedEnv = process.env;
    process.env = { ...savedEnv, MM_WALLET_PASSWORD: '' };
    mockPromptPassword.mockResolvedValue('typed-by-user');
    try {
      await runCommand(WalletUnlock, []);
    } finally {
      // eslint-disable-next-line require-atomic-updates
      process.env = savedEnv;
    }

    expect(mockPromptPassword).toHaveBeenCalledTimes(1);
    expect(mockSendCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        params: ['KeyringController:submitPassword', 'typed-by-user'],
      }),
    );
  });

  it('exits cleanly when the interactive prompt is cancelled (ExitPromptError)', async () => {
    const savedEnv = process.env;
    process.env = { ...savedEnv };
    delete process.env.MM_WALLET_PASSWORD;
    const exitPromptError = Object.assign(
      new Error('User force closed the prompt'),
      {
        name: 'ExitPromptError',
      },
    );
    mockPromptPassword.mockRejectedValue(exitPromptError);
    try {
      const { stdout, error } = await runCommand(WalletUnlock, []);
      expect(error).toBeUndefined();
      expect(stdout).toBe('');
      expect(mockSendCommand).not.toHaveBeenCalled();
    } finally {
      // eslint-disable-next-line require-atomic-updates
      process.env = savedEnv;
    }
  });

  it('surfaces a genuine prompt failure (non-cancellation error)', async () => {
    const savedEnv = process.env;
    process.env = { ...savedEnv };
    delete process.env.MM_WALLET_PASSWORD;
    mockPromptPassword.mockRejectedValue(new Error('Dynamic import failed'));
    try {
      await expect(runCommand(WalletUnlock, [])).rejects.toThrow(
        'Dynamic import failed',
      );
    } finally {
      // eslint-disable-next-line require-atomic-updates
      process.env = savedEnv;
    }
  });

  it('returns a friendly hint when the daemon is not running (ENOENT)', async () => {
    mockSendCommand.mockRejectedValue(
      Object.assign(new Error('no such file'), { code: 'ENOENT' }),
    );

    const { error } = await runCommand(WalletUnlock, SUCCESS_FLAGS);

    expect(error?.message).toContain('Daemon is not running');
  });

  it('returns a friendly hint when the daemon refuses the connection', async () => {
    mockSendCommand.mockRejectedValue(
      Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }),
    );

    const { error } = await runCommand(WalletUnlock, SUCCESS_FLAGS);

    expect(error?.message).toContain('Daemon is not running');
  });

  it('reports a lost connection when the daemon crashes mid-request (ECONNRESET)', async () => {
    mockSendCommand.mockRejectedValue(
      Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }),
    );

    const { error } = await runCommand(WalletUnlock, SUCCESS_FLAGS);

    expect(error?.message).toContain('Lost the connection to the daemon');
  });

  it('returns a permission-specific hint for EPERM', async () => {
    mockSendCommand.mockRejectedValue(
      Object.assign(new Error('operation not permitted'), { code: 'EPERM' }),
    );

    const { error } = await runCommand(WalletUnlock, SUCCESS_FLAGS);

    expect(error?.message).toContain('permission denied');
  });

  it('surfaces other socket errors with the raw message', async () => {
    mockSendCommand.mockRejectedValue(new Error('Socket read timed out'));

    const { error } = await runCommand(WalletUnlock, SUCCESS_FLAGS);

    expect(error?.message).toContain('Socket read timed out');
  });

  it('handles non-Error throws from sendCommand', async () => {
    mockSendCommand.mockImplementation(async () =>
      Promise.reject('string error' as unknown as Error),
    );

    const { error } = await runCommand(WalletUnlock, SUCCESS_FLAGS);

    expect(error?.message).toContain('string error');
  });

  it('errors with the JSON-RPC failure when submitPassword rejects', async () => {
    mockSendCommand.mockResolvedValue({
      jsonrpc: '2.0',
      id: '1',
      error: { code: -32000, message: 'Incorrect password' },
    });

    const { error } = await runCommand(WalletUnlock, SUCCESS_FLAGS);

    expect(error?.message).toContain('Failed to unlock');
    expect(error?.message).toContain('Incorrect password');
    expect(error?.message).toContain('-32000');
  });

  it('surfaces the `data` field when the JSON-RPC failure carries one', async () => {
    mockSendCommand.mockResolvedValue({
      jsonrpc: '2.0',
      id: '1',
      error: {
        code: -32000,
        message: 'Incorrect password',
        data: { attemptsRemaining: 2 },
      },
    });

    const { error } = await runCommand(WalletUnlock, SUCCESS_FLAGS);

    expect(error?.message).toContain('attemptsRemaining');
  });

  it('returns a permission-specific hint when the socket is unreadable (EACCES)', async () => {
    mockSendCommand.mockRejectedValue(
      Object.assign(new Error('permission denied'), { code: 'EACCES' }),
    );

    const { error } = await runCommand(WalletUnlock, SUCCESS_FLAGS);

    expect(error?.message).toContain('permission denied');
    expect(error?.message).toContain('MM_DAEMON_DATA_DIR');
  });

  it('reports success on each of two successive unlock invocations', async () => {
    // `sendCommand` is mocked, so this only pins the CLI-layer contract: a
    // second `mm wallet unlock` still reports success rather than erroring.
    // Real keyring idempotency (submitPassword on an already-unlocked vault)
    // is exercised against a real Wallet in wallet-factory.integration.test.ts.
    const { stdout: firstStdout } = await runCommand(
      WalletUnlock,
      SUCCESS_FLAGS,
    );
    const { stdout: secondStdout } = await runCommand(
      WalletUnlock,
      SUCCESS_FLAGS,
    );

    expect(firstStdout).toContain('Wallet unlocked.');
    expect(secondStdout).toContain('Wallet unlocked.');
    expect(mockSendCommand).toHaveBeenCalledTimes(2);
  });
});
