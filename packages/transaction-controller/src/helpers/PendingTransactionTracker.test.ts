/* eslint-disable jsdoc/require-jsdoc */

import { query } from '@metamask/controller-utils';
import type { BlockTracker } from '@metamask/network-controller';

import { TransactionStatus } from '../types';
import { PendingTransactionTracker } from './PendingTransactionTracker';
import { on } from 'events';

const ID_MOCK = 'testId';
const CHAIN_ID_MOCK = '0x1';
const NONCE_MOCK = '0x2';
const BLOCK_NUMBER_MOCK = '0x123';

const TRANSACTION_SUBMITTED_MOCK = {
  id: ID_MOCK,
  chainId: CHAIN_ID_MOCK,
  hash: '0x1',
  rawTx: '0x987',
  status: TransactionStatus.submitted,
  txParams: {
    nonce: NONCE_MOCK,
  },
};

const RECEIPT_MOCK = {
  blockNumber: BLOCK_NUMBER_MOCK,
  gasUsed: '0x123',
  status: '0x1',
};

const BLOCK_MOCK = {
  baseFeePerGas: '0x456',
  timestamp: 123456,
};

jest.mock('@metamask/controller-utils', () => ({
  query: jest.fn(),
  safelyExecute: (fn: () => any) => fn(),
}));

function createBlockTrackerMock(): jest.Mocked<BlockTracker> {
  return {
    on: jest.fn(),
  } as any;
}

describe('PendingTransactionTracker', () => {
  const queryMock = jest.mocked(query);
  let blockTracker: jest.Mocked<BlockTracker>;
  let failTransaction: jest.Mock;
  let options: any;

  async function onLatestBlock(latestBlockNumber?: string) {
    await blockTracker.on.mock.calls[0][1](latestBlockNumber);
  }

  beforeEach(() => {
    jest.resetAllMocks();

    blockTracker = createBlockTrackerMock();
    failTransaction = jest.fn();

    options = {
      approveTransaction: jest.fn(),
      blockTracker,
      failTransaction,
      getChainId: () => CHAIN_ID_MOCK,
      getEthQuery: () => ({}),
      getTransactions: () => [],
      publishTransaction: jest.fn(),
    };
  });

  describe('on latest block', () => {
    describe('checks status', () => {
      describe('does nothing', () => {
        it('if no pending transactions', async () => {
          const listener = jest.fn();

          const tracker = new PendingTransactionTracker({
            ...options,
            getTransactions: () => [],
          } as any);

          tracker.hub.addListener('transaction-dropped', listener);
          tracker.hub.addListener('transaction-failed', listener);
          tracker.hub.addListener('transaction-confirmed', listener);
          tracker.hub.addListener('transaction-updated', listener);
          tracker.start();

          await onLatestBlock();

          expect(listener).toHaveBeenCalledTimes(0);
        });

        it('if no receipt', async () => {
          const listener = jest.fn();

          const tracker = new PendingTransactionTracker({
            ...options,
            getTransactions: () => [{ ...TRANSACTION_SUBMITTED_MOCK }],
          } as any);

          tracker.hub.addListener('transaction-dropped', listener);
          tracker.hub.addListener('transaction-failed', listener);
          tracker.hub.addListener('transaction-confirmed', listener);
          tracker.start();

          queryMock.mockResolvedValueOnce(undefined);
          queryMock.mockResolvedValueOnce('0x1');

          await onLatestBlock();

          expect(listener).toHaveBeenCalledTimes(0);
        });
      });

      describe('fires failed event', () => {
        it('if no hash', async () => {
          const listener = jest.fn();

          const transactionMetaMock = {
            ...TRANSACTION_SUBMITTED_MOCK,
            hash: undefined,
          };

          const tracker = new PendingTransactionTracker({
            ...options,
            getTransactions: () => [transactionMetaMock],
          } as any);

          tracker.hub.addListener('transaction-failed', listener);
          tracker.start();

          await onLatestBlock();

          expect(listener).toHaveBeenCalledTimes(1);
          expect(listener).toHaveBeenCalledWith(
            transactionMetaMock,
            new Error(
              'We had an error while submitting this transaction, please try again.',
            ),
          );
        });

        it('if receipt has error status', async () => {
          const listener = jest.fn();

          const tracker = new PendingTransactionTracker({
            ...options,
            getTransactions: () => [{ ...TRANSACTION_SUBMITTED_MOCK }],
          } as any);

          tracker.hub.addListener('transaction-failed', listener);
          tracker.start();

          queryMock.mockResolvedValueOnce({ ...RECEIPT_MOCK, status: '0x0' });

          await onLatestBlock();

          expect(listener).toHaveBeenCalledTimes(1);
          expect(listener).toHaveBeenCalledWith(
            TRANSACTION_SUBMITTED_MOCK,
            new Error('Transaction dropped or replaced'),
          );
        });
      });

      describe('fires dropped event', () => {
        it('if duplicate nonce', async () => {
          const listener = jest.fn();

          const confirmedTransactionMetaMock = {
            ...TRANSACTION_SUBMITTED_MOCK,
            id: `${ID_MOCK}2`,
            status: TransactionStatus.confirmed,
          };

          const submittedTransactionMetaMock = {
            ...TRANSACTION_SUBMITTED_MOCK,
          };

          const tracker = new PendingTransactionTracker({
            ...options,
            getTransactions: () => [
              confirmedTransactionMetaMock,
              submittedTransactionMetaMock,
            ],
          } as any);

          tracker.hub.addListener('transaction-dropped', listener);
          tracker.start();

          await onLatestBlock();

          expect(listener).toHaveBeenCalledTimes(1);
          expect(listener).toHaveBeenCalledWith(submittedTransactionMetaMock);
        });

        it('if nonce exceeded for 3 subsequent blocks', async () => {
          const listener = jest.fn();

          const tracker = new PendingTransactionTracker({
            ...options,
            getTransactions: () => [{ ...TRANSACTION_SUBMITTED_MOCK }],
          } as any);

          tracker.hub.addListener('transaction-dropped', listener);
          tracker.start();

          for (let i = 0; i < 4; i++) {
            expect(listener).toHaveBeenCalledTimes(0);

            queryMock.mockResolvedValueOnce(undefined);
            queryMock.mockResolvedValueOnce('0x3');

            await onLatestBlock();
          }

          expect(listener).toHaveBeenCalledTimes(1);
          expect(listener).toHaveBeenCalledWith(TRANSACTION_SUBMITTED_MOCK);
        });
      });

      describe('fires confirmed event', () => {
        it('if receipt has success status', async () => {
          const listener = jest.fn();

          const tracker = new PendingTransactionTracker({
            ...options,
            getTransactions: () => [{ ...TRANSACTION_SUBMITTED_MOCK }],
          } as any);

          tracker.hub.addListener('transaction-confirmed', listener);
          tracker.start();

          queryMock.mockResolvedValueOnce(RECEIPT_MOCK);
          queryMock.mockResolvedValueOnce(BLOCK_MOCK);

          await onLatestBlock();

          expect(listener).toHaveBeenCalledTimes(1);
          expect(listener).toHaveBeenCalledWith({
            ...TRANSACTION_SUBMITTED_MOCK,
            baseFeePerGas: BLOCK_MOCK.baseFeePerGas,
            blockTimestamp: BLOCK_MOCK.timestamp,
            status: TransactionStatus.confirmed,
            txReceipt: RECEIPT_MOCK,
            verifiedOnBlockchain: true,
          });
        });
      });

      describe('fires updated event', () => {
        it('if receipt has success status', async () => {
          const listener = jest.fn();

          const tracker = new PendingTransactionTracker({
            ...options,
            getTransactions: () => [{ ...TRANSACTION_SUBMITTED_MOCK }],
          } as any);

          tracker.hub.addListener('transaction-updated', listener);
          tracker.start();

          queryMock.mockResolvedValueOnce(RECEIPT_MOCK);
          queryMock.mockResolvedValueOnce(BLOCK_MOCK);

          await onLatestBlock();

          expect(listener).toHaveBeenCalledTimes(2);
          expect(listener).toHaveBeenCalledWith(
            {
              ...TRANSACTION_SUBMITTED_MOCK,
              baseFeePerGas: BLOCK_MOCK.baseFeePerGas,
              blockTimestamp: BLOCK_MOCK.timestamp,
              status: TransactionStatus.confirmed,
              txReceipt: RECEIPT_MOCK,
              verifiedOnBlockchain: true,
            },
            'PendingTransactionTracker:#onTransactionConfirmed - Transaction confirmed',
          );
        });

        it('if getTransactionReceipt fails', async () => {
          const listener = jest.fn();
          const transaction = { ...TRANSACTION_SUBMITTED_MOCK };

          const tracker = new PendingTransactionTracker({
            ...options,
            getTransactions: () => [transaction],
          } as any);

          tracker.hub.addListener('transaction-updated', listener);
          tracker.start();

          queryMock.mockRejectedValueOnce(new Error('TestError'));
          queryMock.mockResolvedValueOnce(BLOCK_MOCK);

          await onLatestBlock(BLOCK_NUMBER_MOCK);

          expect(listener).toHaveBeenCalledTimes(2);
          expect(listener).toHaveBeenCalledWith(
            {
              ...TRANSACTION_SUBMITTED_MOCK,
              firstRetryBlockNumber: BLOCK_NUMBER_MOCK,
              warning: {
                error: 'TestError',
                message: 'There was a problem loading this transaction.',
              },
            },
            'PendingTransactionTracker:#warnTransaction - Warning added',
          );
        });
      });
    });

    describe('resubmits', () => {
      describe('does nothing', () => {
        it('if no pending transactions', async () => {
          const tracker = new PendingTransactionTracker({
            ...options,
            getTransactions: () => [],
          } as any);

          tracker.start();

          await onLatestBlock();

          expect(options.approveTransaction).toHaveBeenCalledTimes(0);
          expect(options.publishTransaction).toHaveBeenCalledTimes(0);
        });
      });

      describe('fires updated event', () => {
        it('if first retry check', async () => {
          const listener = jest.fn();

          const tracker = new PendingTransactionTracker({
            ...options,
            getTransactions: () => [{ ...TRANSACTION_SUBMITTED_MOCK }],
          } as any);

          tracker.hub.addListener('transaction-updated', listener);
          tracker.start();

          queryMock.mockResolvedValueOnce(undefined);
          queryMock.mockResolvedValueOnce('0x1');

          await onLatestBlock(BLOCK_NUMBER_MOCK);

          expect(listener).toHaveBeenCalledTimes(1);
          expect(listener).toHaveBeenCalledWith(
            {
              ...TRANSACTION_SUBMITTED_MOCK,
              firstRetryBlockNumber: BLOCK_NUMBER_MOCK,
            },
            'PendingTransactionTracker:#isResubmitDue - First retry block number set',
          );
        });

        it('if published', async () => {
          const listener = jest.fn();
          const transaction = { ...TRANSACTION_SUBMITTED_MOCK };

          const tracker = new PendingTransactionTracker({
            ...options,
            getTransactions: () => [transaction],
          } as any);

          tracker.hub.addListener('transaction-updated', listener);
          tracker.start();

          queryMock.mockResolvedValueOnce(undefined);
          queryMock.mockResolvedValueOnce('0x1');

          await onLatestBlock(BLOCK_NUMBER_MOCK);
          await onLatestBlock('0x124');

          expect(listener).toHaveBeenCalledTimes(2);
          expect(listener).toHaveBeenCalledWith(
            {
              ...TRANSACTION_SUBMITTED_MOCK,
              firstRetryBlockNumber: BLOCK_NUMBER_MOCK,
              retryCount: 1,
            },
            'PendingTransactionTracker:transaction-retry - Retry count increased',
          );
        });

        it('if publishing fails', async () => {
          const listener = jest.fn();
          const transaction = { ...TRANSACTION_SUBMITTED_MOCK };

          const tracker = new PendingTransactionTracker({
            ...options,
            getTransactions: () => [transaction],
          } as any);

          tracker.hub.addListener('transaction-updated', listener);
          tracker.start();

          queryMock.mockResolvedValueOnce(undefined);
          queryMock.mockResolvedValueOnce(BLOCK_MOCK);

          options.publishTransaction.mockRejectedValueOnce(
            new Error('TestError'),
          );

          await onLatestBlock(BLOCK_NUMBER_MOCK);
          await onLatestBlock('0x124');

          expect(listener).toHaveBeenCalledTimes(2);
          expect(listener).toHaveBeenCalledWith(
            {
              ...TRANSACTION_SUBMITTED_MOCK,
              firstRetryBlockNumber: BLOCK_NUMBER_MOCK,
              warning: {
                error: 'TestError',
                message:
                  'There was an error when resubmitting this transaction.',
              },
            },
            'PendingTransactionTracker:#warnTransaction - Warning added',
          );
        });

        it('unless publishing fails and known error', async () => {
          const listener = jest.fn();
          const transaction = { ...TRANSACTION_SUBMITTED_MOCK };

          const tracker = new PendingTransactionTracker({
            ...options,
            getTransactions: () => [transaction],
          } as any);

          tracker.hub.addListener('transaction-updated', listener);
          tracker.start();

          queryMock.mockResolvedValueOnce(undefined);
          queryMock.mockResolvedValueOnce(BLOCK_MOCK);

          options.publishTransaction.mockRejectedValueOnce(
            new Error('test gas price too low to replace test'),
          );

          await onLatestBlock(BLOCK_NUMBER_MOCK);
          await onLatestBlock('0x124');

          expect(listener).toHaveBeenCalledTimes(1);
          expect(listener).not.toHaveBeenCalledWith(
            expect.any(Object),
            'PendingTransactionTracker:#warnTransaction - Warning added',
          );
        });
      });

      describe('publishes transaction', () => {
        it('if latest block number increased', async () => {
          const transaction = { ...TRANSACTION_SUBMITTED_MOCK };

          const tracker = new PendingTransactionTracker({
            ...options,
            getTransactions: () => [transaction],
          } as any);

          tracker.start();

          queryMock.mockResolvedValueOnce(undefined);
          queryMock.mockResolvedValueOnce('0x1');

          await onLatestBlock(BLOCK_NUMBER_MOCK);
          await onLatestBlock('0x124');

          expect(options.publishTransaction).toHaveBeenCalledTimes(1);
          expect(options.publishTransaction).toHaveBeenCalledWith(
            TRANSACTION_SUBMITTED_MOCK.rawTx,
          );
        });

        it('if latest block number matches retry count exponential delay', async () => {
          const transaction = { ...TRANSACTION_SUBMITTED_MOCK };

          const tracker = new PendingTransactionTracker({
            ...options,
            getTransactions: () => [transaction],
          } as any);

          tracker.start();

          queryMock.mockResolvedValueOnce(undefined);
          queryMock.mockResolvedValueOnce('0x1');

          await onLatestBlock(BLOCK_NUMBER_MOCK);
          expect(options.publishTransaction).toHaveBeenCalledTimes(0);

          await onLatestBlock('0x124');
          expect(options.publishTransaction).toHaveBeenCalledTimes(1);

          await onLatestBlock('0x125');
          expect(options.publishTransaction).toHaveBeenCalledTimes(2);

          await onLatestBlock('0x126');
          expect(options.publishTransaction).toHaveBeenCalledTimes(2);

          await onLatestBlock('0x127');
          expect(options.publishTransaction).toHaveBeenCalledTimes(3);

          await onLatestBlock('0x12A');
          expect(options.publishTransaction).toHaveBeenCalledTimes(3);

          await onLatestBlock('0x12B');
          expect(options.publishTransaction).toHaveBeenCalledTimes(4);
        });

        it('unless resubmit disabled', async () => {
          const transaction = { ...TRANSACTION_SUBMITTED_MOCK };

          const tracker = new PendingTransactionTracker({
            ...options,
            getTransactions: () => [transaction],
            isResubmitEnabled: false,
          } as any);

          tracker.start();

          queryMock.mockResolvedValueOnce(undefined);
          queryMock.mockResolvedValueOnce('0x1');

          await onLatestBlock(BLOCK_NUMBER_MOCK);
          await onLatestBlock('0x124');

          expect(options.publishTransaction).toHaveBeenCalledTimes(0);
        });
      });

      describe('approves transaction', () => {
        it('if no raw transaction', async () => {
          const transaction = {
            ...TRANSACTION_SUBMITTED_MOCK,
            rawTx: undefined,
          };

          const tracker = new PendingTransactionTracker({
            ...options,
            getTransactions: () => [transaction],
          } as any);

          tracker.start();

          queryMock.mockResolvedValueOnce(undefined);
          queryMock.mockResolvedValueOnce('0x1');

          await onLatestBlock(BLOCK_NUMBER_MOCK);
          await onLatestBlock('0x124');

          expect(options.approveTransaction).toHaveBeenCalledTimes(1);
          expect(options.approveTransaction).toHaveBeenCalledWith(
            TRANSACTION_SUBMITTED_MOCK.id,
          );
        });
      });
    });
  });
});
