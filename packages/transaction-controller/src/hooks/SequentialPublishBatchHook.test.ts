import type EthQuery from '@metamask/eth-query';
import type { Hex } from '@metamask/utils';

import { SequentialPublishBatchHook } from './SequentialPublishBatchHook';
import { flushPromises } from '../../../../tests/helpers';
import type { PendingTransactionTracker } from '../helpers/PendingTransactionTracker';
import type { PublishBatchHookTransaction, TransactionMeta } from '../types';

jest.mock('@metamask/controller-utils', () => ({
  query: jest.fn(),
}));

const queryMock = jest.requireMock('@metamask/controller-utils').query;

const TRANSACTION_HASH_MOCK = '0x123';
const TRANSACTION_HASH_2_MOCK = '0x456';
const NETWORK_CLIENT_ID_MOCK = 'testNetworkClientId';
const TRANSACTION_ID_MOCK = 'testTransactionId';
const TRANSACTION_ID_2_MOCK = 'testTransactionId2';
const TRANSACTION_SIGNED_MOCK =
  '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
const TRANSACTION_SIGNED_2_MOCK =
  '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567891';
const TRANSACTION_PARAMS_MOCK = {
  from: '0x1234567890abcdef1234567890abcdef12345678' as Hex,
  to: '0xabcdef1234567890abcdef1234567890abcdef12' as Hex,
  value: '0x1' as Hex,
};
const TRANSACTION_1_MOCK = {
  id: TRANSACTION_ID_MOCK,
  signedTx: TRANSACTION_SIGNED_MOCK,
  params: TRANSACTION_PARAMS_MOCK,
} as PublishBatchHookTransaction;
const TRANSACTION_2_MOCK = {
  id: TRANSACTION_ID_2_MOCK,
  signedTx: TRANSACTION_SIGNED_2_MOCK,
  params: TRANSACTION_PARAMS_MOCK,
} as PublishBatchHookTransaction;

const TRANSACTION_META_MOCK = {
  id: TRANSACTION_ID_MOCK,
  rawTx: '0xabcdef',
} as TransactionMeta;

const TRANSACTION_META_2_MOCK = {
  id: TRANSACTION_ID_2_MOCK,
  rawTx: '0x123456',
} as TransactionMeta;

describe('SequentialPublishBatchHook', () => {
  const eventListeners: Record<string, jest.Mock[]> = {};
  let publishTransactionMock: jest.MockedFn<
    (ethQuery: EthQuery, transactionMeta: TransactionMeta) => Promise<Hex>
  >;
  let getTransactionMock: jest.MockedFn<(id: string) => TransactionMeta>;
  let getEthQueryMock: jest.MockedFn<(networkClientId: string) => EthQuery>;
  let ethQueryInstanceMock: EthQuery;
  let pendingTransactionTrackerMock: jest.Mocked<PendingTransactionTracker>;

  /**
   * Simulate an event from the pending transaction tracker.
   *
   * @param eventName - The name of the event to fire.
   * @param args - Additional arguments to pass to the event handler.
   */
  function firePendingTransactionTrackerEvent(
    eventName: string,
    ...args: unknown[]
  ) {
    eventListeners[eventName]?.forEach((callback) => callback(...args));
  }

  beforeEach(() => {
    jest.resetAllMocks();

    publishTransactionMock = jest.fn();
    getTransactionMock = jest.fn();
    getEthQueryMock = jest.fn();

    ethQueryInstanceMock = {} as EthQuery;
    getEthQueryMock.mockReturnValue(ethQueryInstanceMock);

    getTransactionMock.mockImplementation((id) => {
      if (id === TRANSACTION_ID_MOCK) {
        return TRANSACTION_META_MOCK;
      }
      if (id === TRANSACTION_ID_2_MOCK) {
        return TRANSACTION_META_2_MOCK;
      }
      throw new Error(`Transaction with ID ${id} not found`);
    });

    pendingTransactionTrackerMock = {
      hub: {
        on: jest.fn((eventName, callback) => {
          if (!eventListeners[eventName]) {
            eventListeners[eventName] = [];
          }
          eventListeners[eventName].push(callback);
        }),
        removeAllListeners: jest.fn((eventName) => {
          if (eventName) {
            eventListeners[eventName] = [];
          } else {
            Object.keys(eventListeners).forEach((key) => {
              eventListeners[key] = [];
            });
          }
        }),
      },
      forceCheckTransaction: jest.fn(),
    } as unknown as jest.Mocked<PendingTransactionTracker>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('publishes multiple transactions sequentially', async () => {
    const transactions: PublishBatchHookTransaction[] = [
      TRANSACTION_1_MOCK,
      TRANSACTION_2_MOCK,
    ];

    publishTransactionMock
      .mockResolvedValueOnce(TRANSACTION_HASH_MOCK)
      .mockResolvedValueOnce(TRANSACTION_HASH_2_MOCK);

    const sequentialPublishBatchHook = new SequentialPublishBatchHook({
      publishTransaction: publishTransactionMock,
      getTransaction: getTransactionMock,
      getEthQuery: getEthQueryMock,
      getPendingTransactionTrackerByChainId: jest
        .fn()
        .mockReturnValue(pendingTransactionTrackerMock),
    });

    const hook = sequentialPublishBatchHook.getHook();

    const resultPromise = hook({
      from: '0x123',
      networkClientId: NETWORK_CLIENT_ID_MOCK,
      transactions,
    });

    // Simulate confirmation for the first transaction
    await flushPromises();
    firePendingTransactionTrackerEvent(
      'transaction-confirmed',
      TRANSACTION_META_MOCK,
    );

    // Simulate confirmation for the second transaction
    await flushPromises();
    firePendingTransactionTrackerEvent(
      'transaction-confirmed',
      TRANSACTION_META_2_MOCK,
    );

    const result = await resultPromise;

    expect(result).toStrictEqual({
      results: [
        { transactionHash: TRANSACTION_HASH_MOCK },
        { transactionHash: TRANSACTION_HASH_2_MOCK },
      ],
    });

    expect(publishTransactionMock).toHaveBeenCalledTimes(2);
    expect(publishTransactionMock).toHaveBeenNthCalledWith(
      1,
      ethQueryInstanceMock,
      TRANSACTION_META_MOCK,
    );
    expect(publishTransactionMock).toHaveBeenNthCalledWith(
      2,
      ethQueryInstanceMock,
      TRANSACTION_META_2_MOCK,
    );

    expect(
      pendingTransactionTrackerMock.forceCheckTransaction,
    ).toHaveBeenCalledTimes(2);
    expect(
      pendingTransactionTrackerMock.forceCheckTransaction,
    ).toHaveBeenNthCalledWith(1, TRANSACTION_META_MOCK);
    expect(
      pendingTransactionTrackerMock.forceCheckTransaction,
    ).toHaveBeenNthCalledWith(2, TRANSACTION_META_2_MOCK);

    expect(pendingTransactionTrackerMock.hub.on).toHaveBeenCalledTimes(6);
    expect(
      pendingTransactionTrackerMock.hub.removeAllListeners,
    ).toHaveBeenCalledTimes(6);
  });

  it('throws an error when publishTransaction fails', async () => {
    const transactions: PublishBatchHookTransaction[] = [TRANSACTION_1_MOCK];

    publishTransactionMock.mockRejectedValueOnce(
      new Error('Failed to publish transaction'),
    );

    const sequentialPublishBatchHook = new SequentialPublishBatchHook({
      publishTransaction: publishTransactionMock,
      getTransaction: getTransactionMock,
      getEthQuery: getEthQueryMock,
      getPendingTransactionTrackerByChainId: jest
        .fn()
        .mockReturnValue(pendingTransactionTrackerMock),
    });

    const hook = sequentialPublishBatchHook.getHook();

    await expect(
      hook({
        from: '0x123',
        networkClientId: NETWORK_CLIENT_ID_MOCK,
        transactions,
      }),
    ).rejects.toThrow('Failed to publish batch transaction');

    expect(publishTransactionMock).toHaveBeenCalledTimes(1);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('returns an empty result when transactions array is empty', async () => {
    const transactions: PublishBatchHookTransaction[] = [];

    const sequentialPublishBatchHook = new SequentialPublishBatchHook({
      publishTransaction: publishTransactionMock,
      getTransaction: getTransactionMock,
      getEthQuery: getEthQueryMock,
      getPendingTransactionTrackerByChainId: jest
        .fn()
        .mockReturnValue(pendingTransactionTrackerMock),
    });

    const hook = sequentialPublishBatchHook.getHook();

    const result = await hook({
      from: '0x123',
      networkClientId: NETWORK_CLIENT_ID_MOCK,
      transactions,
    });

    expect(result).toStrictEqual({ results: [] });
    expect(publishTransactionMock).not.toHaveBeenCalled();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('throws an error for invalid transaction ID', async () => {
    const transactions: PublishBatchHookTransaction[] = [
      {
        id: 'invalidTransactionId',
        signedTx: TRANSACTION_SIGNED_MOCK,
        params: TRANSACTION_PARAMS_MOCK,
      },
    ];

    const sequentialPublishBatchHook = new SequentialPublishBatchHook({
      publishTransaction: publishTransactionMock,
      getTransaction: getTransactionMock,
      getEthQuery: getEthQueryMock,
      getPendingTransactionTrackerByChainId: jest
        .fn()
        .mockReturnValue(pendingTransactionTrackerMock),
    });

    const hook = sequentialPublishBatchHook.getHook();

    await expect(
      hook({
        from: '0x123',
        networkClientId: NETWORK_CLIENT_ID_MOCK,
        transactions,
      }),
    ).rejects.toThrow('Failed to publish batch transaction');

    expect(publishTransactionMock).not.toHaveBeenCalled();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('handles transaction dropped event correctly', async () => {
    const transactions: PublishBatchHookTransaction[] = [TRANSACTION_1_MOCK];

    publishTransactionMock.mockResolvedValueOnce(TRANSACTION_HASH_MOCK);

    const sequentialPublishBatchHook = new SequentialPublishBatchHook({
      publishTransaction: publishTransactionMock,
      getTransaction: getTransactionMock,
      getEthQuery: getEthQueryMock,
      getPendingTransactionTrackerByChainId: jest
        .fn()
        .mockReturnValue(pendingTransactionTrackerMock),
    });

    const hook = sequentialPublishBatchHook.getHook();

    const hookPromise = hook({
      from: '0x123',
      networkClientId: NETWORK_CLIENT_ID_MOCK,
      transactions,
    });

    await flushPromises();

    firePendingTransactionTrackerEvent(
      'transaction-dropped',
      TRANSACTION_META_MOCK,
    );

    await expect(hookPromise).rejects.toThrow(
      `Failed to publish batch transaction`,
    );

    expect(
      pendingTransactionTrackerMock.forceCheckTransaction,
    ).toHaveBeenCalledTimes(1);
    expect(
      pendingTransactionTrackerMock.forceCheckTransaction,
    ).toHaveBeenCalledWith(TRANSACTION_META_MOCK);
    expect(
      pendingTransactionTrackerMock.hub.removeAllListeners,
    ).toHaveBeenCalledTimes(3);
    expect(publishTransactionMock).toHaveBeenCalledTimes(1);
  });

  it('handles transaction failed event correctly', async () => {
    const transactions: PublishBatchHookTransaction[] = [TRANSACTION_1_MOCK];

    publishTransactionMock.mockResolvedValueOnce(TRANSACTION_HASH_MOCK);

    const sequentialPublishBatchHook = new SequentialPublishBatchHook({
      publishTransaction: publishTransactionMock,
      getTransaction: getTransactionMock,
      getEthQuery: getEthQueryMock,
      getPendingTransactionTrackerByChainId: jest
        .fn()
        .mockReturnValue(pendingTransactionTrackerMock),
    });

    const hook = sequentialPublishBatchHook.getHook();

    const hookPromise = hook({
      from: '0x123',
      networkClientId: NETWORK_CLIENT_ID_MOCK,
      transactions,
    });

    await flushPromises();

    firePendingTransactionTrackerEvent(
      'transaction-failed',
      TRANSACTION_META_MOCK,
      new Error('Transaction failed'),
    );

    await expect(hookPromise).rejects.toThrow(
      `Failed to publish batch transaction`,
    );

    expect(
      pendingTransactionTrackerMock.forceCheckTransaction,
    ).toHaveBeenCalledTimes(1);
    expect(
      pendingTransactionTrackerMock.forceCheckTransaction,
    ).toHaveBeenCalledWith(TRANSACTION_META_MOCK);
    expect(
      pendingTransactionTrackerMock.hub.removeAllListeners,
    ).toHaveBeenCalledTimes(3);
    expect(publishTransactionMock).toHaveBeenCalledTimes(1);
  });
});
