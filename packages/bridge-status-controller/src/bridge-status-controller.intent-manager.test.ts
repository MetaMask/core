/* eslint-disable @typescript-eslint/no-explicit-any */
import { StatusTypes } from '@metamask/bridge-controller';
import { TransactionStatus } from '@metamask/transaction-controller';

import { IntentStatusManager } from './bridge-status-controller.intent';
import type { BridgeHistoryItem } from './types';
import { translateIntentOrderToBridgeStatus } from './utils/intent-api';
import { IntentOrderStatus } from './utils/validators';

const makeHistoryItem = (
  overrides?: Partial<BridgeHistoryItem>,
): BridgeHistoryItem =>
  ({
    quote: {
      srcChainId: 1,
      destChainId: 1,
      intent: { protocol: 'cowswap' },
    },
    status: {
      status: StatusTypes.PENDING,
      srcChain: { chainId: 1, txHash: '' },
    },
    account: '0xaccount1',
    estimatedProcessingTimeInSeconds: 10,
    slippagePercentage: 0,
    hasApprovalTx: false,
    ...overrides,
  }) as BridgeHistoryItem;

describe('IntentStatusManager', () => {
  it('returns early when no original tx id is present', () => {
    const messenger = {
      call: jest.fn(),
    } as any;
    const updateTransactionFn = jest.fn();
    const manager = new IntentStatusManager({
      messenger,
      updateTransactionFn,
    });

    const translation = translateIntentOrderToBridgeStatus(
      {
        id: 'order-1',
        status: IntentOrderStatus.SUBMITTED,
        metadata: {},
      },
      1,
    );

    manager.syncTransactionFromIntentStatus(
      'order-1',
      makeHistoryItem({
        txMetaId: undefined,
        originalTransactionId: undefined,
      }),
      translation,
      IntentOrderStatus.SUBMITTED,
    );

    expect(updateTransactionFn).not.toHaveBeenCalled();
    expect(messenger.call).not.toHaveBeenCalled();
  });

  it('logs when TransactionController access throws', () => {
    const messenger = {
      call: jest.fn(() => {
        throw new Error('boom');
      }),
    } as any;
    const updateTransactionFn = jest.fn();
    const manager = new IntentStatusManager({
      messenger,
      updateTransactionFn,
    });

    const translation = translateIntentOrderToBridgeStatus(
      {
        id: 'order-2',
        status: IntentOrderStatus.SUBMITTED,
        metadata: {},
      },
      1,
    );

    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    manager.syncTransactionFromIntentStatus(
      'order-2',
      makeHistoryItem({ originalTransactionId: 'tx-1' }),
      translation,
      IntentOrderStatus.SUBMITTED,
    );

    expect(consoleSpy).toHaveBeenCalled();
    expect(updateTransactionFn).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('updates transaction meta when tx is found', () => {
    const existingTxMeta = {
      id: 'tx-2',
      status: TransactionStatus.submitted,
      txReceipt: { status: '0x0' },
    };
    const messenger = {
      call: jest.fn(() => ({ transactions: [existingTxMeta] })),
    } as any;
    const updateTransactionFn = jest.fn();
    const manager = new IntentStatusManager({
      messenger,
      updateTransactionFn,
    });

    const translation = translateIntentOrderToBridgeStatus(
      {
        id: 'order-3',
        status: IntentOrderStatus.COMPLETED,
        txHash: '0xhash',
        metadata: {},
      },
      1,
    );

    manager.syncTransactionFromIntentStatus(
      'order-3',
      makeHistoryItem({ originalTransactionId: 'tx-2' }),
      translation,
      IntentOrderStatus.COMPLETED,
    );

    expect(updateTransactionFn).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'tx-2',
        status: TransactionStatus.confirmed,
        hash: '0xhash',
        txReceipt: expect.objectContaining({
          transactionHash: '0xhash',
          status: '0x1',
        }),
      }),
      expect.stringContaining('Intent order status updated'),
    );
  });
});
