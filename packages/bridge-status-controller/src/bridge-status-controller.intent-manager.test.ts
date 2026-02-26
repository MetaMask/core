/* eslint-disable @typescript-eslint/no-explicit-any */
import { StatusTypes } from '@metamask/bridge-controller';
import { TransactionStatus } from '@metamask/transaction-controller';

import { IntentManager } from './bridge-status-controller.intent';
import type { BridgeHistoryItem } from './types';
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

type IntentManagerConstructorOptions = ConstructorParameters<
  typeof IntentManager
>[0];

const createManagerOptions = (overrides?: {
  messenger?: any;
  updateTransactionFn?: ReturnType<typeof jest.fn>;
  fetchFn?: ReturnType<typeof jest.fn>;
}): IntentManagerConstructorOptions => ({
  messenger: overrides?.messenger ?? { call: jest.fn() },
  updateTransactionFn: overrides?.updateTransactionFn ?? jest.fn(),
  customBridgeApiBaseUrl: 'https://example.com',
  fetchFn: overrides?.fetchFn ?? jest.fn(),
  getJwt: jest.fn().mockResolvedValue(undefined),
});

describe('IntentManager', () => {
  it('returns early when no original tx id is present', () => {
    const options = createManagerOptions();
    const manager = new IntentManager(options);

    manager.syncTransactionFromIntentStatus(
      'order-1',
      makeHistoryItem({
        txMetaId: undefined,
        originalTransactionId: undefined,
      }),
    );

    expect(options.updateTransactionFn).not.toHaveBeenCalled();
    expect(options.messenger.call).not.toHaveBeenCalled();
  });

  it('logs when TransactionController access throws', async () => {
    const updateTransactionFn = jest.fn();
    const manager = new IntentManager(
      createManagerOptions({
        messenger: {
          call: jest.fn(() => {
            throw new Error('boom');
          }),
        },
        updateTransactionFn,
        fetchFn: jest.fn().mockResolvedValue({
          id: 'order-2',
          status: IntentOrderStatus.SUBMITTED,
          metadata: {},
        }),
      }),
    );

    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    await manager.getIntentTransactionStatus(
      'order-2',
      makeHistoryItem({ originalTransactionId: 'tx-1' }),
      'client-id',
    );
    manager.syncTransactionFromIntentStatus(
      'order-2',
      makeHistoryItem({ originalTransactionId: 'tx-1' }),
    );

    expect(consoleSpy).toHaveBeenCalled();
    expect(updateTransactionFn).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('updates transaction meta when tx is found', async () => {
    const existingTxMeta = {
      id: 'tx-2',
      status: TransactionStatus.submitted,
      txReceipt: { status: '0x0' },
    };
    const updateTransactionFn = jest.fn();
    const completedOrder = {
      id: 'order-3',
      status: IntentOrderStatus.COMPLETED,
      txHash: '0xhash',
      metadata: {},
    };
    const manager = new IntentManager(
      createManagerOptions({
        messenger: {
          call: jest.fn(() => ({ transactions: [existingTxMeta] })),
        },
        updateTransactionFn,
        fetchFn: jest.fn().mockResolvedValue(completedOrder),
      }),
    );

    const historyItem = makeHistoryItem({
      originalTransactionId: 'tx-2',
      status: {
        status: StatusTypes.PENDING,
        srcChain: { chainId: 1, txHash: '0xhash' },
      },
    });
    await manager.getIntentTransactionStatus(
      'order-3',
      historyItem,
      'client-id',
    );
    manager.syncTransactionFromIntentStatus('order-3', historyItem);

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

  it('getIntentTransactionStatus returns undefined when getOrderStatus rejects with non-Error', async () => {
    const manager = new IntentManager(createManagerOptions());
    jest
      .spyOn(manager.intentApi, 'getOrderStatus')
      .mockRejectedValue('non-Error rejection');

    const result = await manager.getIntentTransactionStatus(
      'order-1',
      makeHistoryItem(),
      'client-id',
    );

    expect(result).toBeUndefined();
  });

  it('getIntentTransactionStatus throws when getOrderStatus rejects with Error', async () => {
    const apiError = new Error('Network failure');
    const manager = new IntentManager(
      createManagerOptions({
        fetchFn: jest.fn().mockRejectedValue(apiError),
      }),
    );

    let thrown: unknown;
    try {
      await manager.getIntentTransactionStatus(
        'order-1',
        makeHistoryItem(),
        'client-id',
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe(
      '[Intent polling] Failed to get intent order status from API: Failed to get order status: Network failure',
    );
  });

  it('getIntentTransactionStatus returns intent statuses when getOrderStatus resolves', async () => {
    const order = {
      id: 'order-1',
      status: IntentOrderStatus.SUBMITTED,
      metadata: {},
    };
    const manager = new IntentManager(
      createManagerOptions({
        fetchFn: jest.fn().mockResolvedValue(order),
      }),
    );
    const historyItem = makeHistoryItem({
      status: {
        status: StatusTypes.PENDING,
        srcChain: { chainId: 1, txHash: '0xabc' },
      },
    });

    const result = await manager.getIntentTransactionStatus(
      'order-1',
      historyItem,
      'client-id',
    );

    expect(result).toBeDefined();
    expect(result?.orderStatus).toBe(IntentOrderStatus.SUBMITTED);
    expect(result?.bridgeStatus).toBeDefined();
  });

  it('getIntentTransactionStatus passes empty txHash fallback when srcChain is missing', async () => {
    const order = {
      id: 'order-1',
      status: IntentOrderStatus.SUBMITTED,
      metadata: {},
    };
    const manager = new IntentManager(
      createManagerOptions({
        fetchFn: jest.fn().mockResolvedValue(order),
      }),
    );
    const historyItemWithoutSrcChain = makeHistoryItem({
      status: { status: StatusTypes.PENDING } as BridgeHistoryItem['status'],
    });

    const result = await manager.getIntentTransactionStatus(
      'order-1',
      historyItemWithoutSrcChain,
      'client-id',
    );

    expect(result).toBeDefined();
    expect(result?.bridgeStatus?.status.srcChain.txHash).toBe('');
  });

  it('syncTransactionFromIntentStatus cleans up intent statuses map when order is complete', async () => {
    const existingTxMeta = {
      id: 'tx-2',
      status: TransactionStatus.submitted,
      txReceipt: { status: '0x0' },
    };
    const updateTransactionFn = jest.fn();
    const completedOrder = {
      id: 'order-3',
      status: IntentOrderStatus.COMPLETED,
      txHash: '0xhash',
      metadata: {},
    };
    const manager = new IntentManager(
      createManagerOptions({
        messenger: {
          call: jest.fn(() => ({ transactions: [existingTxMeta] })),
        },
        updateTransactionFn,
        fetchFn: jest.fn().mockResolvedValue(completedOrder),
      }),
    );

    const historyItem = makeHistoryItem({
      originalTransactionId: 'tx-2',
      status: {
        status: StatusTypes.PENDING,
        srcChain: { chainId: 1, txHash: '0xhash' },
      },
    });
    await manager.getIntentTransactionStatus(
      'order-3',
      historyItem,
      'client-id',
    );
    manager.syncTransactionFromIntentStatus('order-3', historyItem);

    expect(updateTransactionFn).toHaveBeenCalledTimes(1);

    manager.syncTransactionFromIntentStatus('order-3', historyItem);

    expect(updateTransactionFn).toHaveBeenCalledTimes(1);
  });

  it('syncTransactionFromIntentStatus logs warn when transaction is not found', async () => {
    const warnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const manager = new IntentManager(
      createManagerOptions({
        messenger: {
          call: jest.fn(() => ({ transactions: [] })),
        },
        fetchFn: jest.fn().mockResolvedValue({
          id: 'order-1',
          status: IntentOrderStatus.SUBMITTED,
          metadata: {},
        }),
      }),
    );

    await manager.getIntentTransactionStatus(
      'order-1',
      makeHistoryItem({ originalTransactionId: 'tx-missing' }),
      'client-id',
    );
    manager.syncTransactionFromIntentStatus(
      'order-1',
      makeHistoryItem({ originalTransactionId: 'tx-missing' }),
    );

    expect(warnSpy).toHaveBeenCalledWith(
      '[Intent polling] Skipping update, transaction not found',
      expect.any(Object),
    );
    warnSpy.mockRestore();
  });

  it('syncTransactionFromIntentStatus updates tx with txReceipt when bridgeStatus has txHash and is not complete', async () => {
    const existingTxMeta = {
      id: 'tx-2',
      status: TransactionStatus.submitted,
      txReceipt: { status: '0x0' },
    };
    const updateTransactionFn = jest.fn();
    const submittedOrder = {
      id: 'order-3',
      status: IntentOrderStatus.SUBMITTED,
      txHash: '0xhash',
      metadata: {},
    };
    const manager = new IntentManager(
      createManagerOptions({
        messenger: {
          call: jest.fn(() => ({ transactions: [existingTxMeta] })),
        },
        updateTransactionFn,
        fetchFn: jest.fn().mockResolvedValue(submittedOrder),
      }),
    );

    const historyItem = makeHistoryItem({
      originalTransactionId: 'tx-2',
      status: {
        status: StatusTypes.PENDING,
        srcChain: { chainId: 1, txHash: '0xhash' },
      },
    });
    await manager.getIntentTransactionStatus(
      'order-3',
      historyItem,
      'client-id',
    );
    manager.syncTransactionFromIntentStatus('order-3', historyItem);

    expect(updateTransactionFn).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'tx-2',
        txReceipt: expect.objectContaining({
          transactionHash: '0xhash',
          status: '0x0',
        }),
      }),
      expect.any(String),
    );
  });

  it('syncTransactionFromIntentStatus omits hash when bridgeStatus has no txHash', async () => {
    const existingTxMeta = {
      id: 'tx-2',
      status: TransactionStatus.submitted,
      hash: undefined,
    };
    const updateTransactionFn = jest.fn();
    const orderWithoutTxHash = {
      id: 'order-3',
      status: IntentOrderStatus.SUBMITTED,
      metadata: {},
    };
    const manager = new IntentManager(
      createManagerOptions({
        messenger: {
          call: jest.fn(() => ({ transactions: [existingTxMeta] })),
        },
        updateTransactionFn,
        fetchFn: jest.fn().mockResolvedValue(orderWithoutTxHash),
      }),
    );
    const historyItem = makeHistoryItem({
      originalTransactionId: 'tx-2',
      status: {
        status: StatusTypes.PENDING,
        srcChain: { chainId: 1, txHash: '' },
      },
    });
    await manager.getIntentTransactionStatus(
      'order-3',
      historyItem,
      'client-id',
    );
    manager.syncTransactionFromIntentStatus('order-3', historyItem);

    const call = updateTransactionFn.mock.calls[0][0];
    expect(call.hash).toBeUndefined();
  });

  it('syncTransactionFromIntentStatus logs error when updateTransactionFn throws', async () => {
    const existingTxMeta = {
      id: 'tx-2',
      status: TransactionStatus.submitted,
      txReceipt: {},
    };
    const updateTransactionFn = jest.fn().mockImplementation(() => {
      throw new Error('update failed');
    });
    const errorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const manager = new IntentManager(
      createManagerOptions({
        messenger: {
          call: jest.fn(() => ({ transactions: [existingTxMeta] })),
        },
        updateTransactionFn,
        fetchFn: jest.fn().mockResolvedValue({
          id: 'order-3',
          status: IntentOrderStatus.COMPLETED,
          txHash: '0xhash',
          metadata: {},
        }),
      }),
    );

    const historyItem = makeHistoryItem({
      originalTransactionId: 'tx-2',
      status: {
        status: StatusTypes.PENDING,
        srcChain: { chainId: 1, txHash: '0xhash' },
      },
    });
    await manager.getIntentTransactionStatus(
      'order-3',
      historyItem,
      'client-id',
    );
    manager.syncTransactionFromIntentStatus('order-3', historyItem);

    expect(errorSpy).toHaveBeenCalledWith(
      '[Intent polling] Failed to update transaction status',
      expect.objectContaining({
        originalTxId: 'tx-2',
        bridgeHistoryKey: 'order-3',
        error: expect.any(Error),
      }),
    );
    errorSpy.mockRestore();
  });

  it('submitIntent delegates to intentApi.submitIntent', async () => {
    const expectedOrder = {
      id: 'order-1',
      status: IntentOrderStatus.SUBMITTED,
      metadata: {},
    };
    const fetchFn = jest.fn().mockResolvedValue(expectedOrder);
    const manager = new IntentManager(createManagerOptions({ fetchFn }));

    const params = {
      srcChainId: '1',
      quoteId: 'quote-1',
      signature: '0xsig',
      order: { some: 'order' },
      userAddress: '0xuser',
      aggregatorId: 'cowswap',
    };

    const result = await manager.submitIntent(params, 'client-id');

    expect(result).toStrictEqual(expectedOrder);
  });
});
