import type EthQuery from '@metamask/eth-query';
import { rpcErrors } from '@metamask/rpc-errors';
import type { Hex } from '@metamask/utils';

import { SequentialPublishBatchHook } from './SequentialPublishBatchHook';
import { flushPromises } from '../../../../tests/helpers';
import type { PublishBatchHookTransaction, TransactionMeta } from '../types';

jest.mock('@metamask/controller-utils', () => ({
  query: jest.fn(),
}));

const queryMock = jest.requireMock('@metamask/controller-utils').query;

const TRANSACTION_CHECK_INTERVAL = 5000; // 5 seconds
const MAX_TRANSACTION_CHECK_ATTEMPTS = 60; // 5 minutes

const TRANSACTION_HASH_MOCK = '0x123';
const TRANSACTION_HASH_2_MOCK = '0x456';
const NETWORK_CLIENT_ID_MOCK = 'testNetworkClientId';
const TRANSACTION_ID_MOCK = 'testTransactionId';
const TRANSACTION_ID_2_MOCK = 'testTransactionId2';
const RECEIPT_STATUS_SUCCESS = '0x1';
const RECEIPT_STATUS_FAILURE = '0x0';
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
  let publishTransactionMock: jest.MockedFn<
    (ethQuery: EthQuery, transactionMeta: TransactionMeta) => Promise<Hex>
  >;
  let getTransactionMock: jest.MockedFn<(id: string) => TransactionMeta>;
  let getEthQueryMock: jest.MockedFn<(networkClientId: string) => EthQuery>;
  let ethQueryInstanceMock: EthQuery;

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
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getHook', () => {
    it('publishes transactions sequentially and waits for confirmation', async () => {
      queryMock
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({
          status: 'empty',
        })
        .mockResolvedValue({
          status: RECEIPT_STATUS_SUCCESS,
        });

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
      });

      const hook = sequentialPublishBatchHook.getHook();

      const result = await hook({
        from: '0x123',
        networkClientId: NETWORK_CLIENT_ID_MOCK,
        transactions,
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

      expect(queryMock).toHaveBeenCalledTimes(4);
      expect(queryMock).toHaveBeenCalledWith(
        ethQueryInstanceMock,
        'getTransactionReceipt',
        [TRANSACTION_HASH_MOCK],
      );
      expect(queryMock).toHaveBeenCalledWith(
        ethQueryInstanceMock,
        'getTransactionReceipt',
        [TRANSACTION_HASH_2_MOCK],
      );

      expect(result).toStrictEqual({
        results: [
          { transactionHash: TRANSACTION_HASH_MOCK },
          { transactionHash: TRANSACTION_HASH_2_MOCK },
        ],
      });
    });

    it('throws if a transaction fails to publish', async () => {
      const transactions: PublishBatchHookTransaction[] = [TRANSACTION_1_MOCK];

      publishTransactionMock.mockRejectedValueOnce(
        new Error('Failed to publish transaction'),
      );

      const sequentialPublishBatchHook = new SequentialPublishBatchHook({
        publishTransaction: publishTransactionMock,
        getTransaction: getTransactionMock,
        getEthQuery: getEthQueryMock,
      });

      const hook = sequentialPublishBatchHook.getHook();

      await expect(
        hook({
          from: '0x123',
          networkClientId: NETWORK_CLIENT_ID_MOCK,
          transactions,
        }),
      ).rejects.toThrow(
        rpcErrors.internal('Failed to publish sequential batch transaction'),
      );

      expect(publishTransactionMock).toHaveBeenCalledTimes(1);
      expect(publishTransactionMock).toHaveBeenCalledWith(
        ethQueryInstanceMock,
        TRANSACTION_META_MOCK,
      );
      expect(queryMock).not.toHaveBeenCalled();
    });

    it('throws if a transaction is not confirmed', async () => {
      const transactions: PublishBatchHookTransaction[] = [TRANSACTION_1_MOCK];

      publishTransactionMock.mockResolvedValueOnce(TRANSACTION_HASH_MOCK);

      queryMock.mockResolvedValueOnce({
        status: RECEIPT_STATUS_FAILURE,
      });

      const sequentialPublishBatchHook = new SequentialPublishBatchHook({
        publishTransaction: publishTransactionMock,
        getTransaction: getTransactionMock,
        getEthQuery: getEthQueryMock,
      });

      const hook = sequentialPublishBatchHook.getHook();

      await expect(
        hook({
          from: '0x123',
          networkClientId: NETWORK_CLIENT_ID_MOCK,
          transactions,
        }),
      ).rejects.toThrow(`Failed to publish sequential batch transaction`);

      expect(publishTransactionMock).toHaveBeenCalledTimes(1);
      expect(publishTransactionMock).toHaveBeenCalledWith(
        ethQueryInstanceMock,
        TRANSACTION_META_MOCK,
      );
      expect(queryMock).toHaveBeenCalledTimes(1);
      expect(queryMock).toHaveBeenCalledWith(
        ethQueryInstanceMock,
        'getTransactionReceipt',
        [TRANSACTION_HASH_MOCK],
      );
    });

    it('returns false if transaction confirmation exceeds max attempts', async () => {
      jest.useFakeTimers();

      const transactions: PublishBatchHookTransaction[] = [TRANSACTION_1_MOCK];

      publishTransactionMock.mockResolvedValueOnce(TRANSACTION_HASH_MOCK);

      queryMock.mockImplementation(undefined);

      const sequentialPublishBatchHook = new SequentialPublishBatchHook({
        publishTransaction: publishTransactionMock,
        getTransaction: getTransactionMock,
        getEthQuery: getEthQueryMock,
      });

      const hook = sequentialPublishBatchHook.getHook();

      const hookPromise = hook({
        from: '0x123',
        networkClientId: NETWORK_CLIENT_ID_MOCK,
        transactions,
      });

      // Advance time 60 times by the interval (5s) to simulate 60 polling attempts
      for (let i = 0; i < MAX_TRANSACTION_CHECK_ATTEMPTS; i++) {
        jest.advanceTimersByTime(TRANSACTION_CHECK_INTERVAL);
        await flushPromises();
      }

      jest.advanceTimersByTime(TRANSACTION_CHECK_INTERVAL);

      await expect(hookPromise).rejects.toThrow(
        'Failed to publish sequential batch transaction',
      );

      expect(publishTransactionMock).toHaveBeenCalledTimes(1);
      expect(queryMock).toHaveBeenCalledTimes(MAX_TRANSACTION_CHECK_ATTEMPTS);

      jest.useRealTimers();
    });
  });
});
