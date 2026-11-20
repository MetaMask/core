import {
  TransactionStatus,
  TransactionType,
} from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { TransactionPayStrategy } from '../constants.js';
import type { TransactionPayControllerMessenger } from '../types.js';
import { waitForDependencies } from '../utils/dependencies.js';
import { getStrategyByName } from '../utils/strategy.js';
import {
  isPayTransactionResumable,
  resumePayTransactions,
} from './resume-pay-transactions.js';

vi.mock(import('../utils/dependencies.js'));
vi.mock(import('../utils/strategy.js'));

const REMOTE_FEATURE_FLAGS_MOCK = {
  confirmations_pay_extended: {
    resume: {
      [TransactionPayStrategy.Fiat]: {
        transactionTypes: { [TransactionType.predictDeposit]: true },
      },
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
  failTransactionError,
  isUnlocked = true,
  remoteFeatureFlags = REMOTE_FEATURE_FLAGS_MOCK,
  transactions = [],
}: {
  failTransactionError?: Error;
  isUnlocked?: boolean;
  remoteFeatureFlags?: Record<string, unknown>;
  transactions?: TransactionMeta[];
} = {}): {
  call: Mock;
  messenger: TransactionPayControllerMessenger;
  state: { transactions: TransactionMeta[] };
  unlock: () => void;
} {
  const state = { transactions: [...transactions] };
  const unlockHandlers: (() => void)[] = [];
  const call = vi.fn((action: string, ...args: unknown[]) => {
    if (action === 'RemoteFeatureFlagController:getState') {
      return { remoteFeatureFlags };
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

    if (action === 'TransactionController:failTransaction') {
      if (failTransactionError) {
        throw failTransactionError;
      }
      return;
    }

    if (action === 'TransactionController:finalizeResumedTransaction') {
      return;
    }

    throw new Error(`Unexpected action: ${action}`);
  });

  return {
    call,
    messenger: {
      call,
      subscribe: vi.fn((_event: string, handler: () => void) => {
        unlockHandlers.push(handler);
      }),
      unsubscribe: vi.fn(),
    } as unknown as TransactionPayControllerMessenger,
    state,
    unlock: (): void => unlockHandlers.forEach((handler) => handler()),
  };
}

describe('resumePayTransactions', () => {
  const getStrategyByNameMock = vi.mocked(getStrategyByName);
  const waitForDependenciesMock = vi.mocked(waitForDependencies);

  beforeEach(() => {
    vi.resetAllMocks();
    waitForDependenciesMock.mockResolvedValue(true);
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

  it('waits for dependencies before resuming', async () => {
    const transaction = getTransactionMock('tx-1');
    const { messenger } = getMessengerMock({ transactions: [transaction] });

    await resumePayTransactions(messenger);

    expect(waitForDependenciesMock).toHaveBeenCalledWith(messenger);
    expect(messenger.call).toHaveBeenCalledWith(
      'TransactionController:finalizeResumedTransaction',
      'tx-1',
      '0x1234',
    );
  });

  it('fails the transaction without resuming if dependencies are not registered', async () => {
    const transaction = getTransactionMock('tx-1');
    const resume = vi.fn();
    const { messenger, state } = getMessengerMock({
      transactions: [transaction],
    });

    waitForDependenciesMock.mockResolvedValue(false);
    getStrategyByNameMock.mockReturnValue({
      canResume: vi.fn().mockReturnValue(true),
      execute: vi.fn(),
      getQuotes: vi.fn(),
      resume,
    });

    await resumePayTransactions(messenger);

    expect(resume).not.toHaveBeenCalled();
    expect(
      state.transactions[0].metamaskPay?.resumeAttemptedAt,
    ).toBeUndefined();
    expect(messenger.call).toHaveBeenCalledWith(
      'TransactionController:failTransaction',
      'tx-1',
      new Error('Dependencies not registered'),
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

  it('keeps the first resumeAttemptedAt when resuming again after another restart', async () => {
    const resumeAttemptedAt = Date.now() - 60 * 1000;
    const transaction = getTransactionMock('tx-1', {
      metamaskPay: { resumeAttemptedAt, strategy: TransactionPayStrategy.Fiat },
    });
    const { call, messenger, state } = getMessengerMock({
      transactions: [transaction],
    });

    await resumePayTransactions(messenger);

    expect(
      call.mock.calls.filter(
        (callArgs: unknown[]) =>
          callArgs[0] === 'TransactionController:updateTransaction',
      ),
    ).toHaveLength(0);
    expect(state.transactions[0].metamaskPay?.resumeAttemptedAt).toBe(
      resumeAttemptedAt,
    );
    expect(messenger.call).toHaveBeenCalledWith(
      'TransactionController:finalizeResumedTransaction',
      'tx-1',
      '0x1234',
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
    const { call, messenger, state, unlock } = getMessengerMock({
      isUnlocked: false,
      transactions: [transaction],
    });

    const resume = vi.fn();
    getStrategyByNameMock.mockReturnValue({
      canResume: vi.fn().mockReturnValue(true),
      execute: vi.fn(),
      getQuotes: vi.fn(),
      resume,
    });

    const promise = resumePayTransactions(messenger);

    // Simulate the status moving to a final state while the gates were pending.
    state.transactions[0] = {
      ...state.transactions[0],
      status: TransactionStatus.submitted,
    };

    unlock();
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

  it('waits for keyring unlock before resuming', async () => {
    const transaction = getTransactionMock('tx-1');
    const { messenger, unlock } = getMessengerMock({
      isUnlocked: false,
      transactions: [transaction],
    });

    const promise = resumePayTransactions(messenger);
    await Promise.resolve();

    expect(messenger.call).not.toHaveBeenCalledWith(
      'TransactionController:finalizeResumedTransaction',
      expect.anything(),
      expect.anything(),
    );

    unlock();
    await promise;

    expect(messenger.call).toHaveBeenCalledWith(
      'TransactionController:finalizeResumedTransaction',
      'tx-1',
      '0x1234',
    );
  });

  it('skips a transaction removed from state while gates were pending', async () => {
    const transaction = getTransactionMock('tx-1');
    const { messenger, state, unlock } = getMessengerMock({
      isUnlocked: false,
      transactions: [transaction],
    });

    const promise = resumePayTransactions(messenger);

    state.transactions = [];
    unlock();
    await promise;

    expect(messenger.call).not.toHaveBeenCalledWith(
      'TransactionController:failTransaction',
      expect.anything(),
      expect.anything(),
    );
  });

  it('fails the transaction when strategy does not support resume', async () => {
    const transaction = getTransactionMock('tx-1');
    const { messenger } = getMessengerMock({ transactions: [transaction] });
    const canResume = vi.fn().mockReturnValue(true);

    // Candidate scan and re-check before resume.
    getStrategyByNameMock
      .mockReturnValueOnce({ canResume, execute: vi.fn(), getQuotes: vi.fn() })
      .mockReturnValueOnce({ canResume, execute: vi.fn(), getQuotes: vi.fn() })
      .mockReturnValueOnce({ execute: vi.fn(), getQuotes: vi.fn() });

    await resumePayTransactions(messenger);

    expect(messenger.call).toHaveBeenCalledWith(
      'TransactionController:failTransaction',
      'tx-1',
      new Error('Strategy fiat does not support resume'),
    );
  });

  it('fails the transaction when resume returns no hash', async () => {
    const transaction = getTransactionMock('tx-1');
    const { messenger } = getMessengerMock({ transactions: [transaction] });

    getStrategyByNameMock.mockReturnValue({
      canResume: vi.fn().mockReturnValue(true),
      execute: vi.fn(),
      getQuotes: vi.fn(),
      resume: vi.fn().mockResolvedValue({}),
    });

    await resumePayTransactions(messenger);

    expect(messenger.call).toHaveBeenCalledWith(
      'TransactionController:failTransaction',
      'tx-1',
      new Error('Resume did not return a transaction hash'),
    );
  });

  it('wraps non-error rejections when failing the transaction', async () => {
    const transaction = getTransactionMock('tx-1');
    const { messenger } = getMessengerMock({ transactions: [transaction] });

    getStrategyByNameMock.mockReturnValue({
      canResume: vi.fn().mockReturnValue(true),
      execute: vi.fn(),
      getQuotes: vi.fn(),
      resume: vi.fn().mockRejectedValue('string error'),
    });

    await resumePayTransactions(messenger);

    expect(messenger.call).toHaveBeenCalledWith(
      'TransactionController:failTransaction',
      'tx-1',
      new Error('string error'),
    );
  });

  it('does not throw when failing the transaction throws', async () => {
    const transaction = getTransactionMock('tx-1');
    const { messenger } = getMessengerMock({
      failTransactionError: new Error('fail failed'),
      transactions: [transaction],
    });

    getStrategyByNameMock.mockReturnValue({
      canResume: vi.fn().mockReturnValue(true),
      execute: vi.fn(),
      getQuotes: vi.fn(),
      resume: vi.fn().mockRejectedValue(new Error('resume failed')),
    });

    expect(await resumePayTransactions(messenger)).toBeUndefined();
  });
});

describe('isPayTransactionResumable', () => {
  const getStrategyByNameMock = vi.mocked(getStrategyByName);
  const { messenger } = getMessengerMock();

  beforeEach(() => {
    vi.resetAllMocks();
    getStrategyByNameMock.mockReturnValue({
      canResume: vi.fn().mockReturnValue(true),
      execute: vi.fn(),
      getQuotes: vi.fn(),
    });
  });

  it('returns true when the flag enables the pay type and strategy can resume', () => {
    expect(
      isPayTransactionResumable(messenger, getTransactionMock('tx-1')),
    ).toBe(true);
  });

  it('returns false when transaction is undefined', () => {
    expect(isPayTransactionResumable(messenger, undefined)).toBe(false);
  });

  it('returns false when status is submitted', () => {
    expect(
      isPayTransactionResumable(
        messenger,
        getTransactionMock('tx-1', { status: TransactionStatus.submitted }),
      ),
    ).toBe(false);
  });

  it('returns false when metamaskPay is missing', () => {
    expect(
      isPayTransactionResumable(
        messenger,
        getTransactionMock('tx-1', { metamaskPay: undefined }),
      ),
    ).toBe(false);
  });

  it('returns false when strategy is none', () => {
    expect(
      isPayTransactionResumable(
        messenger,
        getTransactionMock('tx-1', {
          metamaskPay: { strategy: TransactionPayStrategy.None },
        }),
      ),
    ).toBe(false);
  });

  it('returns true when resume was attempted within the default timeout', () => {
    expect(
      isPayTransactionResumable(
        messenger,
        getTransactionMock('tx-1', {
          metamaskPay: {
            resumeAttemptedAt: Date.now() - 9 * 60 * 1000,
            strategy: TransactionPayStrategy.Fiat,
          },
        }),
      ),
    ).toBe(true);
  });

  it('returns false when the default timeout has passed since the first resume attempt', () => {
    expect(
      isPayTransactionResumable(
        messenger,
        getTransactionMock('tx-1', {
          metamaskPay: {
            resumeAttemptedAt: Date.now() - 10 * 60 * 1000,
            strategy: TransactionPayStrategy.Fiat,
          },
        }),
      ),
    ).toBe(false);
  });

  it('uses the resume timeout from the feature flag', () => {
    const { messenger: flagMessenger } = getMessengerMock({
      remoteFeatureFlags: {
        confirmations_pay_extended: {
          resume: {
            [TransactionPayStrategy.Fiat]: {
              ...REMOTE_FEATURE_FLAGS_MOCK.confirmations_pay_extended.resume[
                TransactionPayStrategy.Fiat
              ],
              timeout: 1000,
            },
          },
        },
      },
    });

    expect(
      isPayTransactionResumable(
        flagMessenger,
        getTransactionMock('tx-1', {
          metamaskPay: {
            resumeAttemptedAt: Date.now() - 2000,
            strategy: TransactionPayStrategy.Fiat,
          },
        }),
      ),
    ).toBe(false);
  });

  it('returns false when no pay type can be derived', () => {
    expect(
      isPayTransactionResumable(
        messenger,
        getTransactionMock('tx-1', {
          nestedTransactions: [{ type: TransactionType.tokenMethodApprove }],
          type: TransactionType.batch,
        }),
      ),
    ).toBe(false);
  });

  it('uses the first pay-specific nested type for batch transactions', () => {
    expect(
      isPayTransactionResumable(
        messenger,
        getTransactionMock('tx-1', {
          nestedTransactions: [
            { type: TransactionType.tokenMethodApprove },
            { type: TransactionType.predictDeposit },
          ],
          type: TransactionType.batch,
        }),
      ),
    ).toBe(true);
  });

  it('returns false when resume flags are empty', () => {
    const { messenger: emptyFlagsMessenger } = getMessengerMock({
      remoteFeatureFlags: {},
    });

    expect(
      isPayTransactionResumable(
        emptyFlagsMessenger,
        getTransactionMock('tx-1'),
      ),
    ).toBe(false);
  });

  it('returns false when the pay type is disabled for the strategy', () => {
    const { messenger: disabledMessenger } = getMessengerMock({
      remoteFeatureFlags: {
        confirmations_pay_extended: {
          resume: {
            [TransactionPayStrategy.Fiat]: {
              default: true,
              transactionTypes: { [TransactionType.predictDeposit]: false },
            },
          },
        },
      },
    });

    expect(
      isPayTransactionResumable(disabledMessenger, getTransactionMock('tx-1')),
    ).toBe(false);
  });

  it('returns false when canResume is undefined', () => {
    getStrategyByNameMock.mockReturnValue({
      execute: vi.fn(),
      getQuotes: vi.fn(),
    });

    expect(
      isPayTransactionResumable(messenger, getTransactionMock('tx-1')),
    ).toBe(false);
  });

  it('returns false when canResume returns false', () => {
    getStrategyByNameMock.mockReturnValue({
      canResume: vi.fn().mockReturnValue(false),
      execute: vi.fn(),
      getQuotes: vi.fn(),
    });

    expect(
      isPayTransactionResumable(messenger, getTransactionMock('tx-1')),
    ).toBe(false);
  });

  it('returns false when a check throws', () => {
    getStrategyByNameMock.mockImplementation(() => {
      throw new Error('boom');
    });

    expect(
      isPayTransactionResumable(messenger, getTransactionMock('tx-1')),
    ).toBe(false);
  });
});
