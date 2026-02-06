import type { TransactionMeta } from '@metamask/transaction-controller';
import {
  TransactionStatus,
  TransactionType,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import { submitSourceTransactions } from './strategy-helpers';
import {
  collectTransactionIds,
  getTransaction,
  updateTransaction,
  waitForTransactionConfirmed,
} from './transaction';
import { TransactionPayStrategy } from '../constants';
import type { PayStrategyExecuteRequest, TransactionPayQuote } from '../types';

jest.mock('./transaction', () => ({
  collectTransactionIds: jest.fn(),
  getTransaction: jest.fn(),
  updateTransaction: jest.fn(),
  waitForTransactionConfirmed: jest.fn(),
}));

describe('strategy-helpers', () => {
  const collectTransactionIdsMock = jest.mocked(collectTransactionIds);
  const getTransactionMock = jest.mocked(getTransaction);
  const updateTransactionMock = jest.mocked(updateTransaction);
  const waitForTransactionConfirmedMock = jest.mocked(
    waitForTransactionConfirmed,
  );

  const messenger = {} as never;
  const transaction = {
    id: 'tx-1',
    chainId: '0x1',
    networkClientId: 'mainnet',
    status: TransactionStatus.unapproved,
    time: Date.now(),
    txParams: {
      from: '0xabc',
    },
  } as TransactionMeta;
  const quote: TransactionPayQuote<unknown> = {
    dust: { usd: '0', fiat: '0' },
    estimatedDuration: 0,
    fees: {
      provider: { usd: '0', fiat: '0' },
      sourceNetwork: {
        estimate: { usd: '0', fiat: '0', human: '0', raw: '0' },
        max: { usd: '0', fiat: '0', human: '0', raw: '0' },
      },
      targetNetwork: { usd: '0', fiat: '0' },
    },
    original: {},
    request: {
      from: '0xabc' as Hex,
      sourceBalanceRaw: '1',
      sourceChainId: '0x1' as Hex,
      sourceTokenAddress: '0xabc' as Hex,
      sourceTokenAmount: '1',
      targetAmountMinimum: '1',
      targetChainId: '0x2' as Hex,
      targetTokenAddress: '0xdef' as Hex,
    },
    sourceAmount: { usd: '0', fiat: '0', human: '0', raw: '0' },
    strategy: TransactionPayStrategy.Relay,
    targetAmount: { usd: '0', fiat: '0', human: '0', raw: '0' },
  };

  beforeEach(() => {
    jest.resetAllMocks();
    collectTransactionIdsMock.mockImplementation(
      (_chainId, _from, _messenger, onTransaction) => {
        onTransaction('new-tx');
        return { end: jest.fn() };
      },
    );
    waitForTransactionConfirmedMock.mockResolvedValue();
    getTransactionMock.mockReturnValue({ hash: '0xhash' } as never);
  });

  it('uses default intent complete note when not provided', async () => {
    const originalPerformance = globalThis.performance;
    const nowMock = jest
      .fn()
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(1400);
    Object.defineProperty(globalThis, 'performance', {
      value: { now: nowMock },
      configurable: true,
    });

    const onSubmittedMock = jest.fn();

    const request = {
      messenger,
      quotes: [quote],
      transaction,
      onSubmitted: onSubmittedMock,
      isSmartTransaction: jest.fn(),
    } as PayStrategyExecuteRequest<unknown>;

    await submitSourceTransactions({
      request,
      requiredTransactionNote: 'Required transaction note',
      buildTransactions: async () => ({
        chainId: '0x1' as Hex,
        from: '0xabc' as Hex,
        transactions: [
          {
            params: {} as never,
            type: TransactionType.relayDeposit,
          },
        ],
        submit: jest.fn().mockResolvedValue(undefined),
      }),
    });

    const notes = updateTransactionMock.mock.calls.map((call) => call[0].note);
    expect(notes).toContain('Intent complete');
    expect(onSubmittedMock).toHaveBeenCalledWith(400);
    Object.defineProperty(globalThis, 'performance', {
      value: originalPerformance,
      configurable: true,
    });
  });

  it('falls back to Date.now when performance.now is unavailable', async () => {
    const originalPerformance = globalThis.performance;
    Object.defineProperty(globalThis, 'performance', {
      value: { now: undefined },
      configurable: true,
    });

    const onSubmittedMock = jest.fn();
    const dateSpy = jest.spyOn(Date, 'now');
    dateSpy
      .mockReturnValueOnce(2000)
      .mockReturnValueOnce(2400)
      .mockReturnValue(2400);

    const request = {
      messenger,
      quotes: [quote],
      transaction,
      onSubmitted: onSubmittedMock,
      isSmartTransaction: jest.fn(),
    } as PayStrategyExecuteRequest<unknown>;

    await submitSourceTransactions({
      request,
      requiredTransactionNote: 'Required transaction note',
      buildTransactions: async () => ({
        chainId: '0x1' as Hex,
        from: '0xabc' as Hex,
        transactions: [
          {
            params: {} as never,
            type: TransactionType.relayDeposit,
          },
        ],
        submit: jest.fn().mockResolvedValue(undefined),
      }),
    });

    expect(onSubmittedMock).toHaveBeenCalledWith(400);

    dateSpy.mockRestore();
    Object.defineProperty(globalThis, 'performance', {
      value: originalPerformance,
      configurable: true,
    });
  });
});
