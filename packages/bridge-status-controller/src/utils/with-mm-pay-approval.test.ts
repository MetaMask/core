import {
  CHAIN_IDS,
  TransactionStatus,
  TransactionType,
} from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { flushPromises } from '../../../../tests/vitest/helpers.js';
import {
  getControllerMessenger,
  getMockPayControllerState,
  getMockPayQuote,
  getMockTransactionControllerState,
  getRootMessenger,
} from '../__fixtures__/test-utils.js';
import { Operation } from '../types.js';
import { withMmPayApproval } from './with-mm-pay-approval.js';

const ADD_BATCH_TX_TIMEOUT_MS = 120_000;
const BATCH_ID = '0x1234BatchId';
const TX_ID = 'deposit-tx-id';
const MONEY_ACCOUNT = '0x1111111111111111111111111111111111111111' as const;
const UNDERLYING_TOKEN = '0x8888888888888888888888888888888888888888' as const;

const depositTxMeta = (
  overrides: Partial<TransactionMeta> = {},
): TransactionMeta => ({
  id: TX_ID,
  batchId: BATCH_ID,
  type: TransactionType.moneyAccountDeposit,
  status: TransactionStatus.unapproved,
  chainId: CHAIN_IDS.ARBITRUM,
  networkClientId: 'arb',
  time: 1,
  txParams: {
    data: '0xdeposit',
    from: MONEY_ACCOUNT,
    to: '0x7777777777777777777777777777777777777777',
  },
  ...overrides,
});

const countAction = (calls: readonly unknown[][], action: string): number =>
  calls.filter((call) => call[0] === action).length;

const publishPayQuotes = (
  rootMessenger: ReturnType<typeof getRootMessenger>,
  quotes: ReturnType<typeof getMockPayQuote>[],
  txId = TX_ID,
): void => {
  rootMessenger.publish(
    'TransactionPayController:stateChange',
    getMockPayControllerState(txId, quotes),
    [],
  );
};

const publishUnapproved = (
  rootMessenger: ReturnType<typeof getRootMessenger>,
  txMeta: TransactionMeta,
): void => {
  rootMessenger.publish(
    'TransactionController:unapprovedTransactionAdded',
    txMeta,
  );
};

const setupMessenger = (
  transactions: TransactionMeta[],
  handlers: {
    acceptRequest?: () => Promise<{ value?: unknown }>;
    rejectRequest?: (id: string, error: unknown) => void;
    setTransactionConfig?: (transactionId: string) => void;
  } = {},
): {
  rootMessenger: ReturnType<typeof getRootMessenger>;
  messenger: ReturnType<typeof getControllerMessenger>;
  callSpy: Mock<(...args: unknown[]) => unknown>;
} => {
  const rootMessenger = getRootMessenger();
  const messenger = getControllerMessenger(rootMessenger);

  rootMessenger.registerActionHandler('TransactionController:getState', () =>
    getMockTransactionControllerState(transactions),
  );
  rootMessenger.registerActionHandler(
    'ApprovalController:acceptRequest',
    handlers.acceptRequest ?? (async (): Promise<{ value?: unknown }> => ({})),
  );
  rootMessenger.registerActionHandler(
    'ApprovalController:rejectRequest',
    handlers.rejectRequest ??
      ((_id: string, _error: unknown): void => undefined),
  );
  rootMessenger.registerActionHandler(
    'TransactionPayController:setTransactionConfig',
    handlers.setTransactionConfig ??
      ((_transactionId: string): void => undefined),
  );
  rootMessenger.registerActionHandler(
    'TransactionPayController:updatePaymentToken',
    (): void => undefined,
  );

  const callSpy = vi.spyOn(messenger, 'call') as unknown as Mock<
    (...args: unknown[]) => unknown
  >;
  return { rootMessenger, messenger, callSpy };
};

const rejectDepositTxApproval = (id: string): void => {
  if (id !== TX_ID) {
    return;
  }
  throw new Error('no tx approval');
};

const runWithMmPay = (
  messenger: ReturnType<typeof getControllerMessenger>,
  fn: () => Promise<unknown>,
): ReturnType<typeof withMmPayApproval<unknown>> =>
  withMmPayApproval(
    {
      messenger,
      batchId: BATCH_ID,
      primaryMoneyAccount: { address: MONEY_ACCOUNT },
      underlyingToken: UNDERLYING_TOKEN,
      chainId: CHAIN_IDS.ARBITRUM,
      operation: Operation.DEPOSIT,
    },
    fn,
  );

describe('withMmPayApproval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stays subscribed to MM Pay quotes until they exist', async () => {
    const transactions = [depositTxMeta()];
    const { rootMessenger, messenger, callSpy } = setupMessenger(transactions);

    await runWithMmPay(messenger, async () => {
      publishUnapproved(rootMessenger, depositTxMeta());
      await flushPromises();
      publishPayQuotes(rootMessenger, []);
      publishPayQuotes(rootMessenger, []);
      expect(
        countAction(callSpy.mock.calls, 'ApprovalController:acceptRequest'),
      ).toBe(0);
      publishPayQuotes(rootMessenger, [getMockPayQuote()]);
      expect(
        countAction(callSpy.mock.calls, 'ApprovalController:acceptRequest'),
      ).toBe(1);
      const getStateAfterAccept = countAction(
        callSpy.mock.calls,
        'TransactionController:getState',
      );
      publishPayQuotes(rootMessenger, [getMockPayQuote()]);
      expect(
        countAction(callSpy.mock.calls, 'TransactionController:getState'),
      ).toBe(getStateAfterAccept);
    });
  });

  it('stays subscribed to MM Pay quotes when trade meta is missing', async () => {
    const transactions: TransactionMeta[] = [];
    const { rootMessenger, messenger, callSpy } = setupMessenger(transactions);

    await runWithMmPay(messenger, async () => {
      publishUnapproved(rootMessenger, depositTxMeta());
      await flushPromises();
      const getStateBefore = countAction(
        callSpy.mock.calls,
        'TransactionController:getState',
      );

      publishPayQuotes(rootMessenger, [getMockPayQuote()]);
      expect(
        countAction(callSpy.mock.calls, 'TransactionController:getState'),
      ).toBe(getStateBefore + 1);
      expect(
        countAction(callSpy.mock.calls, 'ApprovalController:acceptRequest'),
      ).toBe(0);
      expect(
        countAction(callSpy.mock.calls, 'ApprovalController:rejectRequest'),
      ).toBe(0);

      transactions.push(depositTxMeta());
      publishPayQuotes(rootMessenger, [getMockPayQuote()]);
      expect(
        countAction(callSpy.mock.calls, 'ApprovalController:acceptRequest'),
      ).toBe(1);
      expect(
        countAction(callSpy.mock.calls, 'ApprovalController:rejectRequest'),
      ).toBe(0);
    });
  });

  it('unsubscribes from MM Pay quotes when trade meta is not unapproved', async () => {
    const confirmed = depositTxMeta({ status: TransactionStatus.confirmed });
    const { rootMessenger, messenger, callSpy } = setupMessenger([confirmed]);

    await runWithMmPay(messenger, async () => {
      publishUnapproved(rootMessenger, depositTxMeta());
      await flushPromises();
      const getStateBefore = countAction(
        callSpy.mock.calls,
        'TransactionController:getState',
      );
      publishPayQuotes(rootMessenger, [getMockPayQuote()]);
      publishPayQuotes(rootMessenger, [getMockPayQuote()]);
      expect(
        countAction(callSpy.mock.calls, 'TransactionController:getState'),
      ).toBe(getStateBefore + 1);
      expect(
        countAction(callSpy.mock.calls, 'ApprovalController:acceptRequest'),
      ).toBe(0);
    });
  });

  it('subscribes to MM Pay quotes before the unapproved tx', async () => {
    const subscribed: string[] = [];
    const { rootMessenger, messenger } = setupMessenger([depositTxMeta()]);
    const originalSubscribe = messenger.subscribe.bind(messenger);
    vi.spyOn(messenger, 'subscribe').mockImplementation(
      (eventType, handler) => {
        subscribed.push(eventType);
        return originalSubscribe(eventType, handler);
      },
    );

    await runWithMmPay(messenger, async () => {
      publishUnapproved(rootMessenger, depositTxMeta());
      await flushPromises();
      publishPayQuotes(rootMessenger, [getMockPayQuote()]);
    });

    expect(subscribed.slice(0, 2)).toStrictEqual([
      'TransactionPayController:stateChange',
      'TransactionController:unapprovedTransactionAdded',
    ]);
  });

  it('approves the deposit once then unsubscribes from MM Pay quotes', async () => {
    const { rootMessenger, messenger, callSpy } = setupMessenger([
      depositTxMeta(),
    ]);

    await runWithMmPay(messenger, async () => {
      publishUnapproved(rootMessenger, depositTxMeta());
      await flushPromises();
      const getStateBefore = countAction(
        callSpy.mock.calls,
        'TransactionController:getState',
      );
      publishPayQuotes(rootMessenger, [getMockPayQuote()]);
      publishPayQuotes(rootMessenger, [getMockPayQuote()]);
      expect(
        countAction(callSpy.mock.calls, 'TransactionController:getState'),
      ).toBe(getStateBefore + 1);
      expect(
        countAction(callSpy.mock.calls, 'ApprovalController:acceptRequest'),
      ).toBe(1);
      expect(
        countAction(callSpy.mock.calls, 'ApprovalController:rejectRequest'),
      ).toBe(0);
    });
  });

  it('rejects the batch when MM Pay accept fails', async () => {
    const { rootMessenger, messenger, callSpy } = setupMessenger(
      [depositTxMeta()],
      {
        acceptRequest: async () => {
          throw new Error('accept boom');
        },
      },
    );

    await expect(
      runWithMmPay(messenger, async () => {
        publishUnapproved(rootMessenger, depositTxMeta());
        await flushPromises();
        publishPayQuotes(rootMessenger, [getMockPayQuote()]);
        await flushPromises();
      }),
    ).rejects.toThrow('accept boom');

    expect(
      countAction(callSpy.mock.calls, 'ApprovalController:acceptRequest'),
    ).toBe(1);
    expect(
      countAction(callSpy.mock.calls, 'ApprovalController:rejectRequest'),
    ).toBe(1);
    expect(messenger.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'accept boom' }),
    );
  });

  it('rejects the batch when setTransactionConfig throws after the unapproved tx', async () => {
    const { rootMessenger, messenger, callSpy } = setupMessenger(
      [depositTxMeta()],
      {
        setTransactionConfig: () => {
          throw new Error('config boom');
        },
      },
    );

    await expect(
      runWithMmPay(messenger, async () => {
        publishUnapproved(rootMessenger, depositTxMeta());
        await flushPromises();
      }),
    ).rejects.toThrow('config boom');

    expect(
      countAction(
        callSpy.mock.calls,
        'TransactionPayController:setTransactionConfig',
      ),
    ).toBe(1);
    expect(
      countAction(callSpy.mock.calls, 'ApprovalController:rejectRequest'),
    ).toBe(1);
    expect(messenger.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'config boom' }),
    );
  });

  it('tries the next approval id when rejectRequest throws', async () => {
    vi.useFakeTimers();
    const { rootMessenger, messenger, callSpy } = setupMessenger(
      [depositTxMeta()],
      {
        rejectRequest: rejectDepositTxApproval,
      },
    );

    try {
      const pending = runWithMmPay(messenger, async () => {
        publishUnapproved(rootMessenger, depositTxMeta());
        return new Promise(() => undefined);
      });
      await flushPromises();
      vi.advanceTimersByTime(ADD_BATCH_TX_TIMEOUT_MS);
      await expect(pending).rejects.toThrow(
        'Timed out waiting for deposit batch',
      );
      expect(
        countAction(callSpy.mock.calls, 'ApprovalController:rejectRequest'),
      ).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('times out waiting for MM Pay quotes, unsubscribes, and rejects the approval', async () => {
    vi.useFakeTimers();
    const { rootMessenger, messenger, callSpy } = setupMessenger([
      depositTxMeta(),
    ]);

    try {
      const pending = runWithMmPay(messenger, async () => {
        publishUnapproved(rootMessenger, depositTxMeta());
        return new Promise(() => undefined);
      });
      await flushPromises();
      vi.advanceTimersByTime(ADD_BATCH_TX_TIMEOUT_MS);
      await expect(pending).rejects.toThrow(
        'Timed out waiting for deposit batch',
      );

      const getStateAfterTimeout = countAction(
        callSpy.mock.calls,
        'TransactionController:getState',
      );
      publishPayQuotes(rootMessenger, [getMockPayQuote()]);
      publishPayQuotes(rootMessenger, [getMockPayQuote()]);
      expect(
        countAction(callSpy.mock.calls, 'TransactionController:getState'),
      ).toBe(getStateAfterTimeout);
      expect(
        countAction(callSpy.mock.calls, 'ApprovalController:acceptRequest'),
      ).toBe(0);
      expect(
        countAction(callSpy.mock.calls, 'ApprovalController:rejectRequest'),
      ).toBe(1);
      expect(messenger.captureException).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Timed out waiting for deposit batch',
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('times out the deposit batch, rejects approval, and unblocks the generator', async () => {
    vi.useFakeTimers();
    const { rootMessenger, messenger, callSpy } = setupMessenger([
      depositTxMeta(),
    ]);

    try {
      const pending = runWithMmPay(messenger, async () => {
        publishUnapproved(rootMessenger, depositTxMeta());
        await flushPromises();
        publishPayQuotes(rootMessenger, [getMockPayQuote()]);
        await flushPromises();
        return new Promise(() => undefined);
      });
      await flushPromises();
      expect(
        countAction(callSpy.mock.calls, 'ApprovalController:rejectRequest'),
      ).toBe(0);

      vi.advanceTimersByTime(ADD_BATCH_TX_TIMEOUT_MS);
      await expect(pending).rejects.toThrow(
        'Timed out waiting for deposit batch',
      );
      expect(
        countAction(callSpy.mock.calls, 'ApprovalController:rejectRequest'),
      ).toBe(1);
      expect(
        countAction(callSpy.mock.calls, 'ApprovalController:acceptRequest'),
      ).toBe(1);
      expect(messenger.captureException).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Timed out waiting for deposit batch',
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
