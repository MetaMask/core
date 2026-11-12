import {
  TransactionStatus,
  TransactionType,
} from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { TransactionPayStrategy } from '../constants.js';
import type { TransactionPayControllerMessenger } from '../types.js';
import { getStrategyByName } from '../utils/strategy.js';
import { resumePayTransactions } from './resume-pay-transactions.js';

vi.mock(import('../utils/strategy.js'));

const REMOTE_FEATURE_FLAGS_MOCK = {
  confirmations_pay_extended: {
    resume: {
      [TransactionPayStrategy.Fiat]: [TransactionType.predictDeposit],
    },
  },
};

function getTransactionMock(
  id: string,
  overrides: Partial<TransactionMeta> = {},
): TransactionMeta {
  return {
    id,
    chainId: '0x1',
    metamaskPay: { strategy: TransactionPayStrategy.Fiat },
    status: TransactionStatus.approved,
    time: 0,
    txParams: {},
    type: TransactionType.predictDeposit,
    ...overrides,
  } as TransactionMeta;
}

function getMessengerMock({
  isUnlocked = true,
  transactions = [],
}: {
  isUnlocked?: boolean;
  transactions?: TransactionMeta[];
} = {}): {
  call: Mock;
  messenger: TransactionPayControllerMessenger;
  state: { transactions: TransactionMeta[] };
} {
  const state = { transactions: [...transactions] };
  const call = vi.fn((action: string, ...args: unknown[]) => {
    if (action === 'RemoteFeatureFlagController:getState') {
      return { remoteFeatureFlags: REMOTE_FEATURE_FLAGS_MOCK };
    }

    if (action === 'TransactionController:getState') {
      return state;
    }

    if (action === 'KeyringController:getState') {
      return { isUnlocked };
    }

    if (action === 'TransactionController:updateTransaction') {
      const [updatedTransaction] = args as [TransactionMeta];
      const index = state.transactions.findIndex(
        (tx) => tx.id === updatedTransaction.id,
      );
      state.transactions[index] = updatedTransaction;
      return;
    }

    if (
      action === 'TransactionController:finalizeResumedTransaction' ||
      action === 'TransactionController:failTransaction'
    ) {
      return;
    }

    throw new Error(`Unexpected action: ${action}`);
  });

  return {
    call,
    messenger: {
      call,
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    } as unknown as TransactionPayControllerMessenger,
    state,
  };
}

describe('resumePayTransactions', () => {
  const getStrategyByNameMock = vi.mocked(getStrategyByName);

  beforeEach(() => {
    vi.resetAllMocks();
    getStrategyByNameMock.mockReturnValue({
      canResume: vi.fn().mockReturnValue(true),
      execute: vi.fn(),
      getQuotes: vi.fn(),
      resume: vi.fn().mockResolvedValue({ transactionHash: '0x1234' }),
    });
  });

  it('returns immediately when no candidates exist', async () => {
    const { messenger } = getMessengerMock({ transactions: [] });

    await resumePayTransactions(messenger);

    expect(messenger.subscribe).not.toHaveBeenCalled();
    expect(messenger.call).not.toHaveBeenCalledWith(
      'KeyringController:getState',
    );
    expect(messenger.call).not.toHaveBeenCalledWith(
      'TransactionController:updateTransaction',
      expect.anything(),
      expect.anything(),
    );
  });

  it('treats omitted waitForClientReady as resolved', async () => {
    const transaction = getTransactionMock('tx-1');
    const { messenger } = getMessengerMock({ transactions: [transaction] });

    await resumePayTransactions(messenger);

    expect(messenger.call).toHaveBeenCalledWith(
      'TransactionController:finalizeResumedTransaction',
      'tx-1',
      '0x1234',
    );
  });

  it('writes resumeAttemptedAt before calling resume and finalizes on success', async () => {
    const transaction = getTransactionMock('tx-1');
    const { call, messenger, state } = getMessengerMock({
      transactions: [transaction],
    });
    const order: string[] = [];
    const resume = vi.fn().mockImplementation(() => {
      order.push('resume');
      expect(
        state.transactions[0].metamaskPay?.resumeAttemptedAt,
      ).toStrictEqual(expect.any(Number));
      return Promise.resolve({ transactionHash: '0xabcd' });
    });

    getStrategyByNameMock.mockReturnValue({
      canResume: vi.fn().mockReturnValue(true),
      execute: vi.fn(),
      getQuotes: vi.fn(),
      resume,
    });

    await resumePayTransactions(messenger);

    const updateCall = call.mock.calls.find(
      (callArgs: unknown[]) =>
        callArgs[0] === 'TransactionController:updateTransaction',
    );
    expect(updateCall?.[1]).toMatchObject({
      id: 'tx-1',
      metamaskPay: expect.objectContaining({
        resumeAttemptedAt: expect.any(Number),
      }),
    });
    expect(order).toStrictEqual(['resume']);
    expect(messenger.call).toHaveBeenCalledWith(
      'TransactionController:finalizeResumedTransaction',
      'tx-1',
      '0xabcd',
    );
  });

  it('fails the transaction when resume throws', async () => {
    const transaction = getTransactionMock('tx-1');
    const { messenger } = getMessengerMock({ transactions: [transaction] });
    const error = new Error('resume failed');

    getStrategyByNameMock.mockReturnValue({
      canResume: vi.fn().mockReturnValue(true),
      execute: vi.fn(),
      getQuotes: vi.fn(),
      resume: vi.fn().mockRejectedValue(error),
    });

    await resumePayTransactions(messenger);

    expect(messenger.call).toHaveBeenCalledWith(
      'TransactionController:failTransaction',
      'tx-1',
      error,
    );
  });

  it('skips a transaction whose status moved to a final state while gates were pending', async () => {
    const transaction = getTransactionMock('tx-1');
    const { call, messenger, state } = getMessengerMock({
      transactions: [transaction],
    });

    const resume = vi.fn();
    getStrategyByNameMock.mockReturnValue({
      canResume: vi.fn().mockReturnValue(true),
      execute: vi.fn(),
      getQuotes: vi.fn(),
      resume,
    });

    let resolveClientReady: (() => void) | undefined;
    const waitForClientReady = (): Promise<void> =>
      new Promise<void>((resolve) => {
        resolveClientReady = resolve;
      });

    const promise = resumePayTransactions(messenger, waitForClientReady);

    // Simulate the status moving to a final state while the gates were pending.
    state.transactions[0] = {
      ...state.transactions[0],
      status: TransactionStatus.submitted,
    };

    resolveClientReady?.();
    await promise;

    expect(resume).not.toHaveBeenCalled();
    expect(messenger.call).not.toHaveBeenCalledWith(
      'TransactionController:updateTransaction',
      expect.anything(),
      expect.anything(),
    );
    expect(messenger.call).not.toHaveBeenCalledWith(
      'TransactionController:finalizeResumedTransaction',
      expect.anything(),
      expect.anything(),
    );
    expect(messenger.call).not.toHaveBeenCalledWith(
      'TransactionController:failTransaction',
      expect.anything(),
      expect.anything(),
    );
    expect(call).not.toHaveBeenCalledWith(
      'TransactionController:updateTransaction',
      expect.anything(),
      expect.anything(),
    );
  });

  it('processes candidates sequentially', async () => {
    const first = getTransactionMock('tx-1');
    const second = getTransactionMock('tx-2');
    const { messenger } = getMessengerMock({ transactions: [first, second] });
    let resolveFirst:
      | ((value: { transactionHash: string }) => void)
      | undefined;
    const order: string[] = [];
    const resume = vi
      .fn()
      .mockImplementationOnce(() => {
        order.push('start-1');
        return new Promise((resolve) => {
          resolveFirst = resolve;
        }).then((value) => {
          order.push('finish-1');
          return value;
        });
      })
      .mockImplementationOnce(async () => {
        order.push('start-2');
        return { transactionHash: '0x2' };
      });

    getStrategyByNameMock.mockReturnValue({
      canResume: vi.fn().mockReturnValue(true),
      execute: vi.fn(),
      getQuotes: vi.fn(),
      resume,
    });

    const promise = resumePayTransactions(messenger);
    await vi.waitFor(() => expect(order).toStrictEqual(['start-1']));

    expect(resume).toHaveBeenCalledTimes(1);
    resolveFirst?.({ transactionHash: '0x1' });
    await promise;

    expect(order).toStrictEqual(['start-1', 'finish-1', 'start-2']);
  });
});
