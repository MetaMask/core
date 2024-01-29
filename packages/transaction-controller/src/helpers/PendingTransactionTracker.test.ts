/* eslint-disable jsdoc/require-jsdoc */

import { query } from '@metamask/controller-utils';
import type { BlockTracker } from '@metamask/network-controller';

import type { TransactionMeta } from '../types';
import { TransactionStatus } from '../types';
import { PendingTransactionTracker } from './PendingTransactionTracker';

const ID_MOCK = 'testId';
const CHAIN_ID_MOCK = '0x1';
const NONCE_MOCK = '0x2';
const BLOCK_NUMBER_MOCK = '0x123';

const ETH_QUERY_MOCK = {};

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
  blockHash: '0x321',
  gasUsed: '0x123',
  status: '0x1',
};

const BLOCK_MOCK = {
  baseFeePerGas: '0x456',
  timestamp: 123456,
};

jest.mock('@metamask/controller-utils', () => ({
  query: jest.fn(),
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  safelyExecute: (fn: () => any) => fn(),
}));

function createBlockTrackerMock(): jest.Mocked<BlockTracker> {
  return {
    on: jest.fn(),
    removeListener: jest.fn(),
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('PendingTransactionTracker', () => {
  const queryMock = jest.mocked(query);
  let blockTracker: jest.Mocked<BlockTracker>;
  let failTransaction: jest.Mock;
  let pendingTransactionTracker: PendingTransactionTracker;
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let options: any;

  async function onLatestBlock(
    latestBlockNumber?: string,
    transactionsOnCheck?: TransactionMeta[],
  ) {
    options.getTransactions.mockReturnValue([
      { ...TRANSACTION_SUBMITTED_MOCK },
    ]);

    pendingTransactionTracker.onStateChange();

    if (transactionsOnCheck) {
      options.getTransactions.mockReturnValue(transactionsOnCheck);
    }

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
      getEthQuery: () => ETH_QUERY_MOCK,
      getTransactions: jest.fn(),
      getGlobalLock: () => Promise.resolve(jest.fn()),
      publishTransaction: jest.fn(),
    };
  });

  describe('on state change', () => {
    it('adds block tracker listener if pending transactions', () => {
      pendingTransactionTracker = new PendingTransactionTracker(options);

      options.getTransactions.mockReturnValue([TRANSACTION_SUBMITTED_MOCK]);

      pendingTransactionTracker.onStateChange();

      expect(blockTracker.on).toHaveBeenCalledTimes(1);
      expect(blockTracker.on).toHaveBeenCalledWith(
        'latest',
        expect.any(Function),
      );
    });

    it('does nothing if block tracker listener already added', () => {
      pendingTransactionTracker = new PendingTransactionTracker(options);

      options.getTransactions.mockReturnValue([TRANSACTION_SUBMITTED_MOCK]);

      pendingTransactionTracker.onStateChange();
      pendingTransactionTracker.onStateChange();

      expect(blockTracker.on).toHaveBeenCalledTimes(1);
      expect(blockTracker.removeListener).toHaveBeenCalledTimes(0);
    });

    it('removes block tracker listener if no pending transactions and running', () => {
      pendingTransactionTracker = new PendingTransactionTracker(options);

      options.getTransactions.mockReturnValue([TRANSACTION_SUBMITTED_MOCK]);

      pendingTransactionTracker.onStateChange();

      expect(blockTracker.removeListener).toHaveBeenCalledTimes(0);

      options.getTransactions.mockReturnValue([]);

      pendingTransactionTracker.onStateChange();

      expect(blockTracker.removeListener).toHaveBeenCalledTimes(1);
      expect(blockTracker.removeListener).toHaveBeenCalledWith(
        'latest',
        expect.any(Function),
      );
    });

    it('does nothing if block tracker listener already removed', () => {
      pendingTransactionTracker = new PendingTransactionTracker(options);

      options.getTransactions.mockReturnValue([TRANSACTION_SUBMITTED_MOCK]);

      pendingTransactionTracker.onStateChange();

      expect(blockTracker.removeListener).toHaveBeenCalledTimes(0);

      options.getTransactions.mockReturnValue([]);

      pendingTransactionTracker.onStateChange();

      expect(blockTracker.removeListener).toHaveBeenCalledTimes(1);

      pendingTransactionTracker.onStateChange();

      expect(blockTracker.removeListener).toHaveBeenCalledTimes(1);
    });
  });

  describe('on latest block', () => {
    describe('checks status', () => {
      describe('does nothing', () => {
        it('if no pending transactions', async () => {
          const listener = jest.fn();

          pendingTransactionTracker = new PendingTransactionTracker(options);

          pendingTransactionTracker.hub.addListener(
            'transaction-dropped',
            listener,
          );
          pendingTransactionTracker.hub.addListener(
            'transaction-failed',
            listener,
          );
          pendingTransactionTracker.hub.addListener(
            'transaction-confirmed',
            listener,
          );
          pendingTransactionTracker.hub.addListener(
            'transaction-updated',
            listener,
          );

          await onLatestBlock(undefined, [
            {
              ...TRANSACTION_SUBMITTED_MOCK,
              status: TransactionStatus.dropped,
            },
            {
              ...TRANSACTION_SUBMITTED_MOCK,
              chainId: '0x2',
            },
            {
              ...TRANSACTION_SUBMITTED_MOCK,
              verifiedOnBlockchain: true,
            },
            {
              ...TRANSACTION_SUBMITTED_MOCK,
              isUserOperation: true,
            },
          ] as TransactionMeta[]);

          expect(listener).toHaveBeenCalledTimes(0);
        });

        it('if no receipt', async () => {
          const listener = jest.fn();

          pendingTransactionTracker = new PendingTransactionTracker({
            ...options,
            getTransactions: () => [{ ...TRANSACTION_SUBMITTED_MOCK }],
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any);

          pendingTransactionTracker.hub.addListener(
            'transaction-dropped',
            listener,
          );
          pendingTransactionTracker.hub.addListener(
            'transaction-failed',
            listener,
          );
          pendingTransactionTracker.hub.addListener(
            'transaction-confirmed',
            listener,
          );

          queryMock.mockResolvedValueOnce(undefined);
          queryMock.mockResolvedValueOnce('0x1');

          await onLatestBlock();

          expect(listener).toHaveBeenCalledTimes(0);
        });

        it('if receipt has no status', async () => {
          const listener = jest.fn();

          pendingTransactionTracker = new PendingTransactionTracker({
            ...options,
            getTransactions: () => [{ ...TRANSACTION_SUBMITTED_MOCK }],
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any);

          pendingTransactionTracker.hub.addListener(
            'transaction-dropped',
            listener,
          );
          pendingTransactionTracker.hub.addListener(
            'transaction-failed',
            listener,
          );
          pendingTransactionTracker.hub.addListener(
            'transaction-confirmed',
            listener,
          );

          queryMock.mockResolvedValueOnce({ ...RECEIPT_MOCK, status: null });
          queryMock.mockResolvedValueOnce('0x1');

          await onLatestBlock();

          expect(listener).toHaveBeenCalledTimes(0);
        });

        it('if receipt has invalid status', async () => {
          const listener = jest.fn();

          pendingTransactionTracker = new PendingTransactionTracker({
            ...options,
            getTransactions: () => [{ ...TRANSACTION_SUBMITTED_MOCK }],
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any);

          pendingTransactionTracker.hub.addListener(
            'transaction-dropped',
            listener,
          );
          pendingTransactionTracker.hub.addListener(
            'transaction-failed',
            listener,
          );
          pendingTransactionTracker.hub.addListener(
            'transaction-confirmed',
            listener,
          );

          queryMock.mockResolvedValueOnce({ ...RECEIPT_MOCK, status: '0x3' });
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

          pendingTransactionTracker = new PendingTransactionTracker({
            ...options,
            getTransactions: () => [transactionMetaMock],
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any);

          pendingTransactionTracker.hub.addListener(
            'transaction-failed',
            listener,
          );

          await onLatestBlock();

          expect(listener).toHaveBeenCalledTimes(1);
          expect(listener).toHaveBeenCalledWith(
            transactionMetaMock,
            new Error(
              'We had an error while submitting this transaction, please try again.',
            ),
          );
        });

        it('if no hash because beforeCheckPendingTransaction hook returns false', async () => {
          const listener = jest.fn();

          const transactionMetaMock = {
            ...TRANSACTION_SUBMITTED_MOCK,
            hash: undefined,
          };

          pendingTransactionTracker = new PendingTransactionTracker({
            ...options,
            getTransactions: () => [transactionMetaMock],
            hooks: {
              beforeCheckPendingTransaction: () => false,
              beforePublish: () => false,
            },
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any);

          pendingTransactionTracker.hub.addListener(
            'transaction-failed',
            listener,
          );

          await onLatestBlock();

          expect(listener).toHaveBeenCalledTimes(0);
        });

        it('if receipt has error status', async () => {
          const listener = jest.fn();

          pendingTransactionTracker = new PendingTransactionTracker({
            ...options,
            getTransactions: () => [{ ...TRANSACTION_SUBMITTED_MOCK }],
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any);

          pendingTransactionTracker.hub.addListener(
            'transaction-failed',
            listener,
          );

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

          pendingTransactionTracker = new PendingTransactionTracker({
            ...options,
            getTransactions: () => [
              confirmedTransactionMetaMock,
              submittedTransactionMetaMock,
            ],
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any);

          pendingTransactionTracker.hub.addListener(
            'transaction-dropped',
            listener,
          );

          await onLatestBlock();

          expect(listener).toHaveBeenCalledTimes(1);
          expect(listener).toHaveBeenCalledWith(submittedTransactionMetaMock);
        });

        it('if nonce exceeded for 3 subsequent blocks', async () => {
          const listener = jest.fn();

          pendingTransactionTracker = new PendingTransactionTracker({
            ...options,
            getTransactions: () => [{ ...TRANSACTION_SUBMITTED_MOCK }],
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any);

          pendingTransactionTracker.hub.addListener(
            'transaction-dropped',
            listener,
          );

          for (let i = 0; i < 4; i++) {
            expect(listener).toHaveBeenCalledTimes(0);

            queryMock.mockResolvedValueOnce(undefined);
            queryMock.mockResolvedValueOnce('0x3');

            await onLatestBlock();
          }

          expect(listener).toHaveBeenCalledTimes(1);
          expect(listener).toHaveBeenCalledWith(TRANSACTION_SUBMITTED_MOCK);
        });

        it('unless duplicate nonce on different chain', async () => {
          const listener = jest.fn();

          const confirmedTransactionMetaMock = {
            ...TRANSACTION_SUBMITTED_MOCK,
            id: `${ID_MOCK}2`,
            chainId: '0x2',
            status: TransactionStatus.confirmed,
          };

          const submittedTransactionMetaMock = {
            ...TRANSACTION_SUBMITTED_MOCK,
          };

          pendingTransactionTracker = new PendingTransactionTracker({
            ...options,
            getTransactions: () => [
              confirmedTransactionMetaMock,
              submittedTransactionMetaMock,
            ],
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any);

          pendingTransactionTracker.hub.addListener(
            'transaction-dropped',
            listener,
          );

          await onLatestBlock();

          expect(listener).not.toHaveBeenCalled();
        });
      });

      describe('fires confirmed event', () => {
        it('if receipt has success status', async () => {
          const listener = jest.fn();

          pendingTransactionTracker = new PendingTransactionTracker({
            ...options,
            getTransactions: () => [{ ...TRANSACTION_SUBMITTED_MOCK }],
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any);

          pendingTransactionTracker.hub.addListener(
            'transaction-confirmed',
            listener,
          );

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

          pendingTransactionTracker = new PendingTransactionTracker({
            ...options,
            getTransactions: () => [{ ...TRANSACTION_SUBMITTED_MOCK }],
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any);

          pendingTransactionTracker.hub.addListener(
            'transaction-updated',
            listener,
          );

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

          pendingTransactionTracker = new PendingTransactionTracker({
            ...options,
            getTransactions: () => [transaction],
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any);

          pendingTransactionTracker.hub.addListener(
            'transaction-updated',
            listener,
          );

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
          pendingTransactionTracker = new PendingTransactionTracker(options);

          await onLatestBlock(undefined, []);

          expect(options.approveTransaction).toHaveBeenCalledTimes(0);
          expect(options.publishTransaction).toHaveBeenCalledTimes(0);
        });
      });

      describe('fires updated event', () => {
        it('if first retry check', async () => {
          const listener = jest.fn();

          pendingTransactionTracker = new PendingTransactionTracker({
            ...options,
            getTransactions: () => [{ ...TRANSACTION_SUBMITTED_MOCK }],
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any);

          pendingTransactionTracker.hub.addListener(
            'transaction-updated',
            listener,
          );

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

          pendingTransactionTracker = new PendingTransactionTracker({
            ...options,
            getTransactions: () => [transaction],
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any);

          pendingTransactionTracker.hub.addListener(
            'transaction-updated',
            listener,
          );

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

        it('if beforePublish returns false, does not resubmit the transaction', async () => {
          const listener = jest.fn();
          const transaction = {
            ...TRANSACTION_SUBMITTED_MOCK,
          };

          pendingTransactionTracker = new PendingTransactionTracker({
            ...options,
            getTransactions: () => [transaction],
            hooks: {
              beforeCheckPendingTransaction: () => false,
              beforePublish: () => false,
            },
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any);

          pendingTransactionTracker.hub.addListener(
            'transaction-updated',
            listener,
          );

          queryMock.mockResolvedValueOnce(undefined);
          queryMock.mockResolvedValueOnce('0x1');

          await onLatestBlock(BLOCK_NUMBER_MOCK);
          await onLatestBlock('0x124');

          expect(listener).toHaveBeenCalledTimes(1);
          expect(listener).toHaveBeenCalledWith(
            {
              ...TRANSACTION_SUBMITTED_MOCK,
              firstRetryBlockNumber: BLOCK_NUMBER_MOCK,
            },
            'PendingTransactionTracker:#isResubmitDue - First retry block number set',
          );
          expect(options.publishTransaction).toHaveBeenCalledTimes(0);
        });

        it('if publishing fails', async () => {
          const listener = jest.fn();
          const transaction = { ...TRANSACTION_SUBMITTED_MOCK };

          pendingTransactionTracker = new PendingTransactionTracker({
            ...options,
            getTransactions: () => [transaction],
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any);

          pendingTransactionTracker.hub.addListener(
            'transaction-updated',
            listener,
          );

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

          pendingTransactionTracker = new PendingTransactionTracker({
            ...options,
            getTransactions: () => [transaction],
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any);

          pendingTransactionTracker.hub.addListener(
            'transaction-updated',
            listener,
          );

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

          pendingTransactionTracker = new PendingTransactionTracker({
            ...options,
            getTransactions: () => [transaction],
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any);

          queryMock.mockResolvedValueOnce(undefined);
          queryMock.mockResolvedValueOnce('0x1');

          await onLatestBlock(BLOCK_NUMBER_MOCK);
          await onLatestBlock('0x124');

          expect(options.publishTransaction).toHaveBeenCalledTimes(1);
          expect(options.publishTransaction).toHaveBeenCalledWith(
            ETH_QUERY_MOCK,
            TRANSACTION_SUBMITTED_MOCK.rawTx,
          );
        });

        it('if latest block number matches retry count exponential delay', async () => {
          const transaction = { ...TRANSACTION_SUBMITTED_MOCK };

          pendingTransactionTracker = new PendingTransactionTracker({
            ...options,
            getTransactions: () => [transaction],
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any);

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

          pendingTransactionTracker = new PendingTransactionTracker({
            ...options,
            getTransactions: () => [transaction],
            isResubmitEnabled: false,
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any);

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

          pendingTransactionTracker = new PendingTransactionTracker({
            ...options,
            getTransactions: () => [transaction],
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any);

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
