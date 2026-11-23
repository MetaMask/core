import type { RampsOrder } from '@metamask/ramps-controller';
import { RampsOrderStatus } from '@metamask/ramps-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import {
  TransactionStatus,
  TransactionType,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { CHAIN_ID_MONAD, MUSD_MONAD_ADDRESS } from '../../constants.js';
import type { TransactionPayControllerMessenger } from '../../types.js';
import { waitForKeyringUnlock } from '../../utils/keyring.js';
import { waitForTransactionConfirmed } from '../../utils/transaction.js';
import { MUSD_MONAD_FIAT_ASSET } from './constants.js';
import { submitDirectMusdAfterFiatCompletion } from './fiat-direct-musd.js';
import { resumeFiatDirectMusd } from './fiat-resume.js';
import { waitForOrderCompletion } from './fiat-submit.js';

vi.mock(import('../../utils/transaction.js'), async (importOriginal) => ({
  ...(await importOriginal()),
  waitForTransactionConfirmed: vi.fn(),
}));
vi.mock(import('../../utils/keyring.js'));
vi.mock(import('./fiat-direct-musd.js'), async (importOriginal) => ({
  ...(await importOriginal()),
  submitDirectMusdAfterFiatCompletion: vi.fn(),
}));
vi.mock(import('./fiat-submit.js'), async (importOriginal) => ({
  ...(await importOriginal()),
  waitForOrderCompletion: vi.fn(),
}));

const PARENT_ID_MOCK = 'parent-tx';
const CHILD_ID_MOCK = 'child-tx';
const WALLET_ADDRESS_MOCK = '0x1111111111111111111111111111111111111111' as Hex;
const SUBMITTED_TIME_MOCK = 123_456;
const CHILD_HASH_MOCK = '0xchildhash' as Hex;
const SECOND_LEG_HASH_MOCK = '0xsecondleg' as Hex;

const COMPLETED_ORDER_MOCK = {
  cryptoCurrency: {
    assetId: `eip155:143/erc20:${MUSD_MONAD_ADDRESS}`,
    chainId: 'eip155:143',
  },
  status: RampsOrderStatus.Completed,
  txHash: '0xsettlement',
} as RampsOrder;

function getTransactionMock(
  overrides: Partial<TransactionMeta> = {},
): TransactionMeta {
  return {
    id: PARENT_ID_MOCK,
    metamaskPay: {
      fiat: { orderId: 'order-1', provider: 'transak' },
      strategy: 'fiat',
    },
    requiredTransactionIds: [],
    status: TransactionStatus.approved,
    submittedTime: SUBMITTED_TIME_MOCK,
    time: 0,
    txParams: { from: WALLET_ADDRESS_MOCK },
    type: TransactionType.moneyAccountDeposit,
    ...overrides,
  } as TransactionMeta;
}

function getChildTransactionMock(
  overrides: Partial<TransactionMeta> = {},
): TransactionMeta {
  return {
    chainId: CHAIN_ID_MONAD,
    hash: CHILD_HASH_MOCK,
    id: CHILD_ID_MOCK,
    status: TransactionStatus.confirmed,
    time: 0,
    txParams: { from: WALLET_ADDRESS_MOCK },
    ...overrides,
  } as TransactionMeta;
}

function getMessengerMock(transactions: TransactionMeta[]): {
  call: Mock;
  messenger: TransactionPayControllerMessenger;
  transactions: TransactionMeta[];
} {
  const call = vi.fn((action: string) => {
    if (action === 'TransactionController:getState') {
      return { transactions };
    }

    if (action === 'TransactionController:failTransaction') {
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
    transactions,
  };
}

describe('resumeFiatDirectMusd', () => {
  const submitDirectMusdAfterFiatCompletionMock = vi.mocked(
    submitDirectMusdAfterFiatCompletion,
  );
  const waitForOrderCompletionMock = vi.mocked(waitForOrderCompletion);
  const waitForTransactionConfirmedMock = vi.mocked(
    waitForTransactionConfirmed,
  );
  const waitForKeyringUnlockMock = vi.mocked(waitForKeyringUnlock);

  beforeEach(() => {
    vi.resetAllMocks();

    submitDirectMusdAfterFiatCompletionMock.mockResolvedValue({
      transactionHash: SECOND_LEG_HASH_MOCK,
    });
    waitForOrderCompletionMock.mockResolvedValue(COMPLETED_ORDER_MOCK);
    waitForTransactionConfirmedMock.mockResolvedValue();
    waitForKeyringUnlockMock.mockResolvedValue();
  });

  it('rejects when fiat order metadata is missing', async () => {
    const transaction = getTransactionMock({
      metamaskPay: { strategy: 'fiat' },
    });
    const { messenger } = getMessengerMock([transaction]);

    await expect(
      resumeFiatDirectMusd({ messenger, transaction }),
    ).rejects.toThrow('Missing fiat order metadata');
  });

  it('returns a confirmed existing Monad child hash without polling or submitting a new second leg', async () => {
    const transaction = getTransactionMock({
      requiredTransactionIds: [CHILD_ID_MOCK],
    });
    const child = getChildTransactionMock();
    const { messenger } = getMessengerMock([transaction, child]);

    expect(
      await resumeFiatDirectMusd({ messenger, transaction }),
    ).toStrictEqual({ transactionHash: CHILD_HASH_MOCK });

    expect(waitForOrderCompletionMock).not.toHaveBeenCalled();
    expect(submitDirectMusdAfterFiatCompletionMock).not.toHaveBeenCalled();
    expect(waitForTransactionConfirmedMock).not.toHaveBeenCalled();
  });

  it('waits for a pending existing Monad child and returns its updated hash', async () => {
    const transaction = getTransactionMock({
      requiredTransactionIds: [CHILD_ID_MOCK],
    });
    const child = getChildTransactionMock({
      hash: undefined,
      status: TransactionStatus.submitted,
    });
    const { messenger, transactions } = getMessengerMock([transaction, child]);

    waitForTransactionConfirmedMock.mockImplementation(async () => {
      transactions[1] = getChildTransactionMock({ hash: CHILD_HASH_MOCK });
    });

    expect(
      await resumeFiatDirectMusd({ messenger, transaction }),
    ).toStrictEqual({ transactionHash: CHILD_HASH_MOCK });

    expect(waitForTransactionConfirmedMock).toHaveBeenCalledWith(
      CHILD_ID_MOCK,
      messenger,
    );
    expect(waitForOrderCompletionMock).not.toHaveBeenCalled();
    expect(submitDirectMusdAfterFiatCompletionMock).not.toHaveBeenCalled();
  });

  it.each([TransactionStatus.approved, TransactionStatus.signed])(
    'fails an unpublished %s Monad child and resubmits the second leg',
    async (status) => {
      const transaction = getTransactionMock({
        requiredTransactionIds: [CHILD_ID_MOCK],
      });
      const child = getChildTransactionMock({ hash: undefined, status });
      const { call, messenger } = getMessengerMock([transaction, child]);

      expect(
        await resumeFiatDirectMusd({ messenger, transaction }),
      ).toStrictEqual({ transactionHash: SECOND_LEG_HASH_MOCK });

      expect(call).toHaveBeenCalledWith(
        'TransactionController:failTransaction',
        CHILD_ID_MOCK,
        new Error('Second leg not published before restart'),
      );
      expect(waitForTransactionConfirmedMock).not.toHaveBeenCalled();
      expect(waitForOrderCompletionMock).toHaveBeenCalled();
      expect(submitDirectMusdAfterFiatCompletionMock).toHaveBeenCalled();
    },
  );

  it.each([TransactionStatus.failed, TransactionStatus.dropped])(
    'ignores a %s Monad child and resubmits the second leg',
    async (status) => {
      const transaction = getTransactionMock({
        requiredTransactionIds: [CHILD_ID_MOCK],
      });
      const child = getChildTransactionMock({ hash: undefined, status });
      const { call, messenger } = getMessengerMock([transaction, child]);

      expect(
        await resumeFiatDirectMusd({ messenger, transaction }),
      ).toStrictEqual({ transactionHash: SECOND_LEG_HASH_MOCK });

      expect(
        call.mock.calls.filter(
          ([action]) => action === 'TransactionController:failTransaction',
        ),
      ).toHaveLength(0);
      expect(waitForTransactionConfirmedMock).not.toHaveBeenCalled();
      expect(submitDirectMusdAfterFiatCompletionMock).toHaveBeenCalled();
    },
  );

  it('uses the most recent Monad child when an earlier one failed', async () => {
    const transaction = getTransactionMock({
      requiredTransactionIds: ['old-child', CHILD_ID_MOCK],
    });
    const oldChild = getChildTransactionMock({
      hash: undefined,
      id: 'old-child',
      status: TransactionStatus.failed,
    });
    const child = getChildTransactionMock();
    const { messenger } = getMessengerMock([transaction, oldChild, child]);

    expect(
      await resumeFiatDirectMusd({ messenger, transaction }),
    ).toStrictEqual({ transactionHash: CHILD_HASH_MOCK });

    expect(waitForOrderCompletionMock).not.toHaveBeenCalled();
    expect(submitDirectMusdAfterFiatCompletionMock).not.toHaveBeenCalled();
  });

  it('waits for keyring unlock after the order completes and before submitting', async () => {
    const transaction = getTransactionMock();
    const { messenger } = getMessengerMock([transaction]);
    const order: string[] = [];

    waitForOrderCompletionMock.mockImplementation(async () => {
      order.push('poll');
      return COMPLETED_ORDER_MOCK;
    });
    waitForKeyringUnlockMock.mockImplementation(async () => {
      order.push('unlock');
    });
    submitDirectMusdAfterFiatCompletionMock.mockImplementation(async () => {
      order.push('submit');
      return { transactionHash: SECOND_LEG_HASH_MOCK };
    });

    await resumeFiatDirectMusd({ messenger, transaction });

    expect(order).toStrictEqual(['poll', 'unlock', 'submit']);
    expect(waitForKeyringUnlockMock).toHaveBeenCalledWith(messenger);
  });

  it('resubmits through the CHOMP-guarded path when a submitted Monad child fails', async () => {
    const transaction = getTransactionMock({
      requiredTransactionIds: [CHILD_ID_MOCK],
    });
    const child = getChildTransactionMock({
      hash: undefined,
      status: TransactionStatus.submitted,
    });
    const { messenger } = getMessengerMock([transaction, child]);

    waitForTransactionConfirmedMock.mockRejectedValue(
      new Error('Transaction failed'),
    );

    expect(
      await resumeFiatDirectMusd({ messenger, transaction }),
    ).toStrictEqual({ transactionHash: SECOND_LEG_HASH_MOCK });

    expect(waitForTransactionConfirmedMock).toHaveBeenCalledWith(
      CHILD_ID_MOCK,
      messenger,
    );
    expect(waitForOrderCompletionMock).toHaveBeenCalled();
    expect(waitForKeyringUnlockMock).toHaveBeenCalled();
    expect(submitDirectMusdAfterFiatCompletionMock).toHaveBeenCalledWith({
      messenger,
      order: COMPLETED_ORDER_MOCK,
      transaction,
    });
  });

  it('fails every unpublished Monad child, not only the most recent', async () => {
    const transaction = getTransactionMock({
      requiredTransactionIds: ['old-child', CHILD_ID_MOCK],
    });
    const oldChild = getChildTransactionMock({
      hash: undefined,
      id: 'old-child',
      status: TransactionStatus.signed,
    });
    const child = getChildTransactionMock({
      hash: undefined,
      status: TransactionStatus.failed,
    });
    const { call, messenger } = getMessengerMock([
      transaction,
      oldChild,
      child,
    ]);

    expect(
      await resumeFiatDirectMusd({ messenger, transaction }),
    ).toStrictEqual({ transactionHash: SECOND_LEG_HASH_MOCK });

    expect(
      call.mock.calls.filter(
        ([action]) => action === 'TransactionController:failTransaction',
      ),
    ).toStrictEqual([
      [
        'TransactionController:failTransaction',
        'old-child',
        new Error('Second leg not published before restart'),
      ],
    ]);
    expect(submitDirectMusdAfterFiatCompletionMock).toHaveBeenCalled();
  });

  it('waits for an older submitted Monad child when the most recent was never published', async () => {
    const transaction = getTransactionMock({
      requiredTransactionIds: ['old-child', CHILD_ID_MOCK],
    });
    const oldChild = getChildTransactionMock({
      id: 'old-child',
      status: TransactionStatus.submitted,
    });
    const child = getChildTransactionMock({
      hash: undefined,
      status: TransactionStatus.approved,
    });
    const { call, messenger } = getMessengerMock([
      transaction,
      oldChild,
      child,
    ]);

    expect(
      await resumeFiatDirectMusd({ messenger, transaction }),
    ).toStrictEqual({ transactionHash: CHILD_HASH_MOCK });

    expect(call).toHaveBeenCalledWith(
      'TransactionController:failTransaction',
      CHILD_ID_MOCK,
      new Error('Second leg not published before restart'),
    );
    expect(waitForTransactionConfirmedMock).toHaveBeenCalledWith(
      'old-child',
      messenger,
    );
    expect(waitForOrderCompletionMock).not.toHaveBeenCalled();
  });

  it('ignores required transaction IDs missing from state', async () => {
    const transaction = getTransactionMock({
      requiredTransactionIds: ['missing-child'],
    });
    const { messenger } = getMessengerMock([transaction]);

    expect(
      await resumeFiatDirectMusd({ messenger, transaction }),
    ).toStrictEqual({ transactionHash: SECOND_LEG_HASH_MOCK });
  });

  it('ignores non-Monad required transactions and resumes by polling the fiat order', async () => {
    const transaction = getTransactionMock({
      requiredTransactionIds: [CHILD_ID_MOCK],
    });
    const child = getChildTransactionMock({ chainId: '0x1' });
    const { messenger } = getMessengerMock([transaction, child]);

    expect(
      await resumeFiatDirectMusd({ messenger, transaction }),
    ).toStrictEqual({ transactionHash: SECOND_LEG_HASH_MOCK });

    expect(waitForOrderCompletionMock).toHaveBeenCalledWith({
      messenger,
      orderCode: 'order-1',
      providerCode: 'transak',
      startTime: SUBMITTED_TIME_MOCK,
      transactionId: PARENT_ID_MOCK,
      walletAddress: WALLET_ADDRESS_MOCK,
    });
    expect(submitDirectMusdAfterFiatCompletionMock).toHaveBeenCalledWith({
      messenger,
      order: COMPLETED_ORDER_MOCK,
      transaction,
    });
  });

  it('submits the direct mUSD second leg after the order completes', async () => {
    const transaction = getTransactionMock();
    const { messenger } = getMessengerMock([transaction]);

    expect(
      await resumeFiatDirectMusd({ messenger, transaction }),
    ).toStrictEqual({ transactionHash: SECOND_LEG_HASH_MOCK });

    expect(waitForOrderCompletionMock).toHaveBeenCalledWith({
      messenger,
      orderCode: 'order-1',
      providerCode: 'transak',
      startTime: SUBMITTED_TIME_MOCK,
      transactionId: PARENT_ID_MOCK,
      walletAddress: WALLET_ADDRESS_MOCK,
    });
    expect(submitDirectMusdAfterFiatCompletionMock).toHaveBeenCalledWith({
      messenger,
      order: COMPLETED_ORDER_MOCK,
      transaction,
    });
  });

  it('rejects when the fiat order fails', async () => {
    const transaction = getTransactionMock();
    const { messenger } = getMessengerMock([transaction]);
    waitForOrderCompletionMock.mockRejectedValue(
      new Error('Fiat order failed'),
    );

    await expect(
      resumeFiatDirectMusd({ messenger, transaction }),
    ).rejects.toThrow('Fiat order failed');

    expect(submitDirectMusdAfterFiatCompletionMock).not.toHaveBeenCalled();
  });

  it('preserves the direct mUSD order asset validation error', async () => {
    const transaction = getTransactionMock();
    const { messenger } = getMessengerMock([transaction]);
    submitDirectMusdAfterFiatCompletionMock.mockRejectedValue(
      new Error(
        `Direct mUSD: Order asset mismatch for transaction ${PARENT_ID_MOCK}: expected eip155:143/erc20:${MUSD_MONAD_FIAT_ASSET.address}, got eip155:1/erc20:0x0000000000000000000000000000000000000000`,
      ),
    );

    await expect(
      resumeFiatDirectMusd({ messenger, transaction }),
    ).rejects.toThrow('Direct mUSD: Order asset mismatch');
  });

  it('uses the transaction submittedTime as the fiat order polling start time', async () => {
    const transaction = getTransactionMock({ submittedTime: 1000 });
    const { messenger } = getMessengerMock([transaction]);

    await resumeFiatDirectMusd({ messenger, transaction });

    expect(waitForOrderCompletionMock).toHaveBeenCalledWith(
      expect.objectContaining({ startTime: 1000 }),
    );
  });
});
