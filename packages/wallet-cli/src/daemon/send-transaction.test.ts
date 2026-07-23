import { validate } from '@metamask/superstruct';
import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '@metamask/wallet';

import {
  runSendTransaction,
  SendTransactionParamsStruct,
} from './send-transaction.js';
import type { SendTransactionParams } from './send-transaction.js';

const TO = '0x1111111111111111111111111111111111111111';
const FROM = '0x2222222222222222222222222222222222222222';
const SELECTED = '0x3333333333333333333333333333333333333333';

type MessengerCall = (action: string, ...args: unknown[]) => unknown;

/**
 * Build a fake root messenger whose `call` is driven by a per-action lookup,
 * cast to the typed messenger `runSendTransaction` expects.
 *
 * @param handlers - Map of action name to the value (or promise) it returns.
 * @returns The fake messenger and its underlying `call` jest mock.
 */
function makeMessenger(handlers: Record<string, unknown>): {
  messenger: Readonly<RootMessenger<DefaultActions, DefaultEvents>>;
  call: jest.MockedFunction<MessengerCall>;
} {
  const call = jest.fn<unknown, [string, ...unknown[]]>((action) => {
    if (!Object.prototype.hasOwnProperty.call(handlers, action)) {
      throw new Error(`Unexpected messenger action: ${action}`);
    }
    return handlers[action];
  });
  return {
    messenger: { call } as unknown as Readonly<
      RootMessenger<DefaultActions, DefaultEvents>
    >,
    call,
  };
}

/**
 * A default set of action handlers covering the happy send path.
 *
 * @returns The action-to-result map.
 */
function defaultHandlers(): Record<string, unknown> {
  return {
    'NetworkController:findNetworkClientIdByChainId': 'mainnet',
    'AccountsController:getSelectedAccount': { address: SELECTED },
    'TransactionController:addTransaction': Promise.resolve({
      result: Promise.resolve('0xhash'),
      transactionMeta: { id: 'tx-1', status: 'submitted' },
    }),
  };
}

describe('SendTransactionParamsStruct', () => {
  const base = {
    to: TO,
    networkClientId: 'mainnet',
  };

  it('accepts a minimal params object', () => {
    const [error] = validate(base, SendTransactionParamsStruct);
    expect(error).toBeUndefined();
  });

  it('accepts a fully-specified params object', () => {
    const [error] = validate(
      {
        to: TO,
        from: FROM,
        value: '0x64',
        data: '0xabcdef',
        gas: '0x5208',
        maxFeePerGas: '0x1',
        maxPriorityFeePerGas: '0x1',
        gasPrice: '0x1',
        chainId: '0x1',
        dryRun: true,
      },
      SendTransactionParamsStruct,
    );
    expect(error).toBeUndefined();
  });

  it('rejects an invalid recipient address', () => {
    const [error] = validate(
      { ...base, to: '0xnothex' },
      SendTransactionParamsStruct,
    );
    expect(error?.message).toContain('20-byte hex address');
  });

  it('rejects a non-hex value', () => {
    const [error] = validate(
      { ...base, value: '100' },
      SendTransactionParamsStruct,
    );
    expect(error).toBeDefined();
  });

  it('rejects supplying both networkClientId and chainId', () => {
    const [error] = validate(
      { to: TO, networkClientId: 'mainnet', chainId: '0x1' },
      SendTransactionParamsStruct,
    );
    expect(error?.message).toContain(
      'Exactly one of `networkClientId` or `chainId`',
    );
  });

  it('rejects supplying neither networkClientId nor chainId', () => {
    const [error] = validate({ to: TO }, SendTransactionParamsStruct);
    expect(error?.message).toContain(
      'Exactly one of `networkClientId` or `chainId`',
    );
  });

  it('rejects unknown keys', () => {
    const [error] = validate(
      { ...base, surprise: true },
      SendTransactionParamsStruct,
    );
    expect(error).toBeDefined();
  });
});

describe('runSendTransaction', () => {
  it('resolves the network client from chainId via NetworkController', async () => {
    const { messenger, call } = makeMessenger(defaultHandlers());

    await runSendTransaction(messenger, {
      to: TO,
      chainId: '0x1',
    } as SendTransactionParams);

    expect(call).toHaveBeenCalledWith(
      'NetworkController:findNetworkClientIdByChainId',
      '0x1',
    );
  });

  it('uses a provided networkClientId without querying NetworkController', async () => {
    const { messenger, call } = makeMessenger(defaultHandlers());

    await runSendTransaction(messenger, {
      to: TO,
      networkClientId: 'linea',
    } as SendTransactionParams);

    expect(call).not.toHaveBeenCalledWith(
      'NetworkController:findNetworkClientIdByChainId',
      expect.anything(),
    );
    expect(call).toHaveBeenCalledWith(
      'TransactionController:addTransaction',
      expect.objectContaining({ from: SELECTED, to: TO }),
      expect.objectContaining({ networkClientId: 'linea' }),
    );
  });

  it('defaults `from` to the selected account', async () => {
    const { messenger, call } = makeMessenger(defaultHandlers());

    await runSendTransaction(messenger, {
      to: TO,
      networkClientId: 'mainnet',
    } as SendTransactionParams);

    expect(call).toHaveBeenCalledWith(
      'TransactionController:addTransaction',
      expect.objectContaining({ from: SELECTED }),
      expect.anything(),
    );
  });

  it('uses a provided `from` without querying AccountsController', async () => {
    const { messenger, call } = makeMessenger(defaultHandlers());

    await runSendTransaction(messenger, {
      to: TO,
      from: FROM,
      networkClientId: 'mainnet',
    } as SendTransactionParams);

    expect(call).not.toHaveBeenCalledWith(
      'AccountsController:getSelectedAccount',
    );
    expect(call).toHaveBeenCalledWith(
      'TransactionController:addTransaction',
      expect.objectContaining({ from: FROM }),
      expect.anything(),
    );
  });

  it('submits the transaction as internal with the metamask origin', async () => {
    const { messenger, call } = makeMessenger(defaultHandlers());

    await runSendTransaction(messenger, {
      to: TO,
      networkClientId: 'mainnet',
    } as SendTransactionParams);

    expect(call).toHaveBeenCalledWith(
      'TransactionController:addTransaction',
      expect.anything(),
      { networkClientId: 'mainnet', origin: 'metamask', isInternal: true },
    );
  });

  it('forwards only the provided optional tx fields', async () => {
    const { messenger, call } = makeMessenger(defaultHandlers());

    await runSendTransaction(messenger, {
      to: TO,
      value: '0x64',
      data: '0xabcdef',
      maxFeePerGas: '0x2',
      networkClientId: 'mainnet',
    } as SendTransactionParams);

    const txParams = call.mock.calls.find(
      ([action]) => action === 'TransactionController:addTransaction',
    )?.[1];
    expect(txParams).toStrictEqual({
      from: SELECTED,
      to: TO,
      value: '0x64',
      data: '0xabcdef',
      maxFeePerGas: '0x2',
    });
  });

  it('forwards every gas override when all are provided', async () => {
    const { messenger, call } = makeMessenger(defaultHandlers());

    await runSendTransaction(messenger, {
      to: TO,
      value: '0x64',
      data: '0xabcdef',
      gas: '0x5208',
      maxFeePerGas: '0x2',
      maxPriorityFeePerGas: '0x1',
      gasPrice: '0x3',
      networkClientId: 'mainnet',
    } as SendTransactionParams);

    const txParams = call.mock.calls.find(
      ([action]) => action === 'TransactionController:addTransaction',
    )?.[1];
    expect(txParams).toStrictEqual({
      from: SELECTED,
      to: TO,
      value: '0x64',
      data: '0xabcdef',
      gas: '0x5208',
      maxFeePerGas: '0x2',
      maxPriorityFeePerGas: '0x1',
      gasPrice: '0x3',
    });
  });

  it('defaults value to 0x0 when omitted', async () => {
    const { messenger, call } = makeMessenger(defaultHandlers());

    await runSendTransaction(messenger, {
      to: TO,
      networkClientId: 'mainnet',
    } as SendTransactionParams);

    expect(call).toHaveBeenCalledWith(
      'TransactionController:addTransaction',
      expect.objectContaining({ value: '0x0' }),
      expect.anything(),
    );
  });

  it('awaits the broadcast and returns the hash, id, and status', async () => {
    const { messenger } = makeMessenger(defaultHandlers());

    const result = await runSendTransaction(messenger, {
      to: TO,
      networkClientId: 'mainnet',
    } as SendTransactionParams);

    expect(result).toStrictEqual({
      transactionHash: '0xhash',
      transactionId: 'tx-1',
      status: 'submitted',
    });
  });

  it('propagates a broadcast failure', async () => {
    const { messenger } = makeMessenger({
      ...defaultHandlers(),
      'AccountsController:getSelectedAccount': { address: SELECTED },
      'TransactionController:addTransaction': Promise.resolve({
        result: Promise.reject(new Error('insufficient funds')),
        transactionMeta: { id: 'tx-1', status: 'unapproved' },
      }),
    });

    await expect(
      runSendTransaction(messenger, {
        to: TO,
        networkClientId: 'mainnet',
      } as SendTransactionParams),
    ).rejects.toThrow('insufficient funds');
  });

  describe('dryRun', () => {
    it('returns the resolved plan without adding a transaction', async () => {
      const { messenger, call } = makeMessenger(defaultHandlers());

      const result = await runSendTransaction(messenger, {
        to: TO,
        value: '0x64',
        chainId: '0x1',
        dryRun: true,
      } as SendTransactionParams);

      expect(result).toStrictEqual({
        dryRun: true,
        from: SELECTED,
        to: TO,
        value: '0x64',
        networkClientId: 'mainnet',
      });
      expect(call).not.toHaveBeenCalledWith(
        'TransactionController:addTransaction',
        expect.anything(),
        expect.anything(),
      );
    });

    it('still resolves the network client and sender', async () => {
      const { messenger, call } = makeMessenger(defaultHandlers());

      await runSendTransaction(messenger, {
        to: TO,
        chainId: '0x1',
        dryRun: true,
      } as SendTransactionParams);

      expect(call).toHaveBeenCalledWith(
        'NetworkController:findNetworkClientIdByChainId',
        '0x1',
      );
      expect(call).toHaveBeenCalledWith(
        'AccountsController:getSelectedAccount',
      );
    });
  });
});
