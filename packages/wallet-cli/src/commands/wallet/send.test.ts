import { sendCommand } from '../../daemon/daemon-client.js';
import { confirmSend } from '../../daemon/prompts.js';
import { runCommand } from '../../test/run-command.js';
import WalletSend, { parseEtherToWeiHex } from './send.js';

jest.mock('../../daemon/daemon-client');
jest.mock('../../daemon/prompts');

const mockSendCommand = jest.mocked(sendCommand);
const mockConfirmSend = jest.mocked(confirmSend);

const TO = '0x1111111111111111111111111111111111111111';
const FROM = '0x2222222222222222222222222222222222222222';

const DRY_RUN_RESULT = {
  dryRun: true,
  from: FROM,
  to: TO,
  value: '0x2386f26fc10000',
  networkClientId: 'mainnet',
};

const BROADCAST_RESULT = {
  transactionHash: '0xhash',
  transactionId: 'tx-1',
  status: 'submitted',
};

/**
 * Queue JSON-RPC success responses for successive `sendCommand` calls.
 *
 * @param results - The `result` payloads to return, in call order.
 */
function queueResults(...results: unknown[]): void {
  for (const result of results) {
    mockSendCommand.mockResolvedValueOnce({
      jsonrpc: '2.0',
      id: '1',
      result: result as never,
    });
  }
}

describe('parseEtherToWeiHex', () => {
  it.each([
    ['0', '0x0'],
    ['1', '0xde0b6b3a7640000'],
    ['0.01', '0x2386f26fc10000'],
    ['0.1', '0x16345785d8a0000'],
    ['123.456', '0x6b14bd1e6eea00000'],
  ])('converts %s ether to %s wei', (input, expected) => {
    expect(parseEtherToWeiHex(input)).toBe(expected);
  });

  it('trims surrounding whitespace', () => {
    expect(parseEtherToWeiHex('  1  ')).toBe('0xde0b6b3a7640000');
  });

  it.each(['', 'abc', '1.2.3', '-1', '0x1', '1e18'])(
    'rejects the non-decimal value %p',
    (input) => {
      expect(() => parseEtherToWeiHex(input)).toThrow(
        'expected a non-negative',
      );
    },
  );

  it('rejects more than 18 fractional digits', () => {
    expect(() => parseEtherToWeiHex('0.1234567890123456789')).toThrow(
      'at most 18 decimal places',
    );
  });
});

describe('wallet send', () => {
  beforeEach(() => {
    mockConfirmSend.mockResolvedValue(true);
  });

  it('requires exactly one of --network-client-id / --chain-id', async () => {
    const { error } = await runCommand(WalletSend, ['--to', TO]);
    expect(error?.message).toContain('exactly one');
    expect(mockSendCommand).not.toHaveBeenCalled();
  });

  it('rejects supplying both --network-client-id and --chain-id', async () => {
    const { error } = await runCommand(WalletSend, [
      '--to',
      TO,
      '--network-client-id',
      'mainnet',
      '--chain-id',
      '0x1',
    ]);
    expect(error?.message).toContain('exactly one');
    expect(mockSendCommand).not.toHaveBeenCalled();
  });

  it('rejects an invalid --value before dispatching', async () => {
    const { error } = await runCommand(WalletSend, [
      '--to',
      TO,
      '--chain-id',
      '0x1',
      '--value',
      'not-a-number',
    ]);
    expect(error?.message).toContain('expected a non-negative');
    expect(mockSendCommand).not.toHaveBeenCalled();
  });

  it('previews then broadcasts after confirmation', async () => {
    queueResults(DRY_RUN_RESULT, BROADCAST_RESULT);

    const { stdout } = await runCommand(WalletSend, [
      '--to',
      TO,
      '--chain-id',
      '0x1',
      '--value',
      '0.01',
    ]);

    expect(mockSendCommand).toHaveBeenCalledTimes(2);
    // First call is the dry-run preview...
    expect(mockSendCommand).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        method: 'sendTransaction',
        params: expect.objectContaining({
          to: TO,
          chainId: '0x1',
          value: '0x2386f26fc10000',
          dryRun: true,
        }),
      }),
    );
    // ...the second is the real broadcast, without dryRun.
    const secondParams = mockSendCommand.mock.calls[1]?.[0]?.params as Record<
      string,
      unknown
    >;
    expect(secondParams.dryRun).toBeUndefined();
    expect(mockConfirmSend).toHaveBeenCalledTimes(1);
    expect(stdout).toContain('Transaction broadcast.');
    expect(stdout).toContain('0xhash');
  });

  it('aborts without broadcasting when the user declines', async () => {
    queueResults(DRY_RUN_RESULT);
    mockConfirmSend.mockResolvedValue(false);

    const { stdout } = await runCommand(WalletSend, [
      '--to',
      TO,
      '--chain-id',
      '0x1',
    ]);

    expect(mockSendCommand).toHaveBeenCalledTimes(1);
    expect(stdout).toContain('Aborted.');
  });

  it('aborts cleanly when the confirmation prompt is cancelled', async () => {
    queueResults(DRY_RUN_RESULT);
    mockConfirmSend.mockRejectedValue(
      Object.assign(new Error('User force closed the prompt'), {
        name: 'ExitPromptError',
      }),
    );

    const { stdout, error } = await runCommand(WalletSend, [
      '--to',
      TO,
      '--chain-id',
      '0x1',
    ]);

    expect(error).toBeUndefined();
    expect(stdout).toContain('Aborted.');
    expect(mockSendCommand).toHaveBeenCalledTimes(1);
  });

  it('surfaces a genuine confirmation-prompt failure', async () => {
    queueResults(DRY_RUN_RESULT);
    mockConfirmSend.mockRejectedValue(new Error('prompt crashed'));

    await expect(
      runCommand(WalletSend, ['--to', TO, '--chain-id', '0x1']),
    ).rejects.toThrow('prompt crashed');
  });

  it('skips the preview and prompt with --yes', async () => {
    queueResults(BROADCAST_RESULT);

    const { stdout } = await runCommand(WalletSend, [
      '--to',
      TO,
      '--network-client-id',
      'mainnet',
      '--yes',
    ]);

    expect(mockSendCommand).toHaveBeenCalledTimes(1);
    expect(mockSendCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.not.objectContaining({ dryRun: true }),
      }),
    );
    expect(mockConfirmSend).not.toHaveBeenCalled();
    expect(stdout).toContain('0xhash');
  });

  it('previews and stops with --dry-run', async () => {
    queueResults(DRY_RUN_RESULT);

    const { stdout } = await runCommand(WalletSend, [
      '--to',
      TO,
      '--chain-id',
      '0x1',
      '--dry-run',
    ]);

    expect(mockSendCommand).toHaveBeenCalledTimes(1);
    expect(mockSendCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ dryRun: true }),
      }),
    );
    expect(mockConfirmSend).not.toHaveBeenCalled();
    expect(stdout).toContain('About to send:');
    expect(stdout).toContain(TO);
    expect(stdout).not.toContain('Transaction broadcast.');
  });

  it('forwards optional tx fields and the timeout', async () => {
    queueResults(BROADCAST_RESULT);

    await runCommand(WalletSend, [
      '--to',
      TO,
      '--network-client-id',
      'mainnet',
      '--from',
      FROM,
      '--data',
      '0xabcdef',
      '--gas',
      '0x5208',
      '--max-fee-per-gas',
      '0x2',
      '--max-priority-fee-per-gas',
      '0x1',
      '--gas-price',
      '0x3',
      '--timeout',
      '5000',
      '--yes',
    ]);

    expect(mockSendCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        timeoutMs: 5000,
        params: expect.objectContaining({
          from: FROM,
          data: '0xabcdef',
          gas: '0x5208',
          maxFeePerGas: '0x2',
          maxPriorityFeePerGas: '0x1',
          gasPrice: '0x3',
        }),
      }),
    );
  });

  it('prints (unknown) for fields missing from the result payload', async () => {
    queueResults({ transactionHash: '0xhash' });

    const { stdout } = await runCommand(WalletSend, [
      '--to',
      TO,
      '--network-client-id',
      'mainnet',
      '--yes',
    ]);

    expect(stdout).toContain('Hash:   0xhash');
    expect(stdout).toContain('Id:     (unknown)');
    expect(stdout).toContain('Status: (unknown)');
  });

  it('surfaces a JSON-RPC failure from the daemon', async () => {
    mockSendCommand.mockResolvedValue({
      jsonrpc: '2.0',
      id: '1',
      error: { code: -32000, message: 'Network client not found - foo' },
    });

    const { error } = await runCommand(WalletSend, [
      '--to',
      TO,
      '--network-client-id',
      'foo',
      '--yes',
    ]);

    expect(error?.message).toContain('Network client not found');
  });

  it('reports a friendly hint when the daemon is unreachable', async () => {
    mockSendCommand.mockRejectedValue(
      Object.assign(new Error('no such file'), { code: 'ENOENT' }),
    );

    const { error } = await runCommand(WalletSend, [
      '--to',
      TO,
      '--network-client-id',
      'mainnet',
      '--yes',
    ]);

    expect(error?.message).toContain('Daemon is not running');
  });
});
