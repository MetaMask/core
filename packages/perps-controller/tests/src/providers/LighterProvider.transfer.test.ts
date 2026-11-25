import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { LIGHTER_TX_TYPE_TRANSFER } from '../../../src/constants/lighterConfig.js';
import type { LighterTransferParams } from '../../../src/types/lighter-types.js';
import {
  buildProvider,
  finishPendingTimersAfterEach,
} from '../../helpers/lighterProvider.js';

vi.mock(
  import('../../../src/services/LighterClientService'),
  async (importOriginal) => ({
    ...(await importOriginal()),
    LighterClientService: vi.fn(),
  }),
);
vi.mock('../../../src/services/LighterWalletService');

const MEMO = `0x${'ab'.repeat(32)}`;

const SELECTED_ADDRESS = '0x8D7f03FdE1A626223364E592740a233b72395235';

const TRANSFER: LighterTransferParams = {
  accountIndex: 28,
  eoa: SELECTED_ADDRESS,
  toAccountIndex: 723071,
  assetIndex: 3,
  fromRouteType: 0,
  toRouteType: 0,
  amount: 1000000,
  usdcFee: 3000000,
  memo: MEMO,
};

const failTransferPreparation = (execute: Mock) => {
  const original = execute.getMockImplementation();
  return async (call: { function: string }): Promise<unknown> => {
    if (call.function === '_getTransferTransaction') {
      return { body: '', error: 'bad transfer' };
    }
    return await original?.(call);
  };
};

describe('LighterProvider.submitTransfer', () => {
  finishPendingTimersAfterEach();

  it('has the user sign the transfer plaintext and sends the signed transfer to Lighter', async () => {
    const built = buildProvider({ registeredKey: '9c'.repeat(40) });
    built.signPersonalMessageMock.mockClear();
    built.clientInstance.sendTx.mockClear();

    const result = await built.provider.submitTransfer(TRANSFER);

    const prepare = built.calls.find(
      (call) => call.function === '_getTransferTransaction',
    );
    const sign = built.calls.find((call) => call.function === '_signTransfer');
    const memoBytes = Array.from({ length: 32 }, () => 0xab);
    const nonce = prepare?.params[1];
    expect(result.success).toBe(true);
    expect(prepare?.params.slice(3)).toStrictEqual([
      TRANSFER.toAccountIndex,
      TRANSFER.assetIndex,
      TRANSFER.fromRouteType,
      TRANSFER.toRouteType,
      TRANSFER.amount,
      TRANSFER.usdcFee,
      memoBytes,
    ]);
    expect(built.signPersonalMessageMock).toHaveBeenCalledWith(
      `Transfer Lighter funds\n\nnonce: ${nonce}`,
    );
    expect(sign?.params).toStrictEqual([
      prepare?.params[0],
      `0x${'cd'.repeat(65)}`,
      nonce,
      prepare?.params[2],
      TRANSFER.toAccountIndex,
      TRANSFER.assetIndex,
      TRANSFER.fromRouteType,
      TRANSFER.toRouteType,
      TRANSFER.amount,
      TRANSFER.usdcFee,
      memoBytes,
    ]);
    expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(1);
    expect(built.clientInstance.sendTx.mock.calls[0][0]).toBe(
      LIGHTER_TX_TYPE_TRANSFER,
    );
  });

  it('returns the failure when the signer cannot build the transfer plaintext', async () => {
    const built = buildProvider({ registeredKey: '9c'.repeat(40) });
    const execute = vi.mocked(built.bridge.execute);
    execute.mockImplementation(failTransferPreparation(execute) as never);
    built.clientInstance.sendTx.mockClear();

    const result = await built.provider.submitTransfer(TRANSFER);

    expect(result).toStrictEqual({ success: false, error: 'bad transfer' });
    expect(built.signPersonalMessageMock).not.toHaveBeenCalled();
    expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
  });

  it('refuses a transfer quoted for another account without signing', async () => {
    const built = buildProvider({ registeredKey: '9c'.repeat(40) });
    built.clientInstance.sendTx.mockClear();

    const result = await built.provider.submitTransfer({
      ...TRANSFER,
      eoa: '0x1111111111111111111111111111111111111111',
    });

    expect(result).toStrictEqual({
      success: false,
      error: 'transfer account does not match the selected wallet',
    });
    expect(built.signPersonalMessageMock).not.toHaveBeenCalled();
    expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
    expect(
      built.calls.some((call) => call.function === '_getTransferTransaction'),
    ).toBe(false);
  });

  it('refuses a transfer quoted for another Lighter account without signing', async () => {
    const built = buildProvider({ registeredKey: '9c'.repeat(40) });
    built.clientInstance.sendTx.mockClear();

    const result = await built.provider.submitTransfer({
      ...TRANSFER,
      accountIndex: 29,
    });

    expect(result).toStrictEqual({
      success: false,
      error: 'transfer account does not match the Lighter account',
    });
    expect(built.signPersonalMessageMock).not.toHaveBeenCalled();
    expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
    expect(
      built.calls.some((call) => call.function === '_getTransferTransaction'),
    ).toBe(false);
  });

  it('refuses a transfer quoted for another Lighter account before registering a venue key', async () => {
    const built = buildProvider();
    built.signPersonalMessageMock.mockClear();

    const result = await built.provider.submitTransfer({
      ...TRANSFER,
      accountIndex: 29,
    });

    expect(result).toStrictEqual({
      success: false,
      error: 'transfer account does not match the Lighter account',
    });
    expect(built.signPersonalMessageMock).not.toHaveBeenCalled();
    expect(
      built.calls.some((call) => call.function === '_signChangePubKey'),
    ).toBe(false);
  });

  it('accepts the selected wallet address in any letter case', async () => {
    const built = buildProvider({ registeredKey: '9c'.repeat(40) });

    const result = await built.provider.submitTransfer({
      ...TRANSFER,
      eoa: SELECTED_ADDRESS.toLowerCase(),
    });

    expect(result.success).toBe(true);
  });

  it.each([
    ['an amount of zero', { amount: 0 }, 'transfer parameters are invalid'],
    ['a fractional amount', { amount: 1.5 }, 'transfer parameters are invalid'],
    ['a negative fee', { usdcFee: -1 }, 'transfer parameters are invalid'],
    ['a short memo', { memo: '0xabcd' }, 'transfer memo must be 32 bytes'],
    [
      'a memo without 0x',
      { memo: 'ab'.repeat(32) },
      'transfer memo must be 32 bytes',
    ],
  ])('rejects %s without signing', async (_label, override, error) => {
    const built = buildProvider({ registeredKey: '9c'.repeat(40) });
    built.clientInstance.sendTx.mockClear();

    const result = await built.provider.submitTransfer({
      ...TRANSFER,
      ...override,
    });

    expect(result).toStrictEqual({ success: false, error });
    expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
    expect(
      built.calls.some((call) => call.function === '_getTransferTransaction'),
    ).toBe(false);
  });
});
