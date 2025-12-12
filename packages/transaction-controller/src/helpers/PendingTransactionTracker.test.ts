import { query } from '@metamask/controller-utils';
import type EthQuery from '@metamask/eth-query';
import type { BlockTracker } from '@metamask/network-controller';
import { Json } from '@metamask/utils';
import { freeze } from 'immer';

import { PendingTransactionTracker } from './PendingTransactionTracker';
import { TransactionPoller } from './TransactionPoller';
import type { TransactionControllerMessenger } from '../TransactionController';
import type { TransactionMeta } from '../types';
import { TransactionStatus } from '../types';

const ID_MOCK = 'testId';
const CHAIN_ID_MOCK = '0x1';
const NETWORK_CLIENT_ID_MOCK = 'testNetworkClientId';
const NONCE_MOCK = '0x2';
const BLOCK_NUMBER_MOCK = '0x123';

const ETH_QUERY_MOCK = {} as unknown as EthQuery;

const TRANSACTION_SUBMITTED_MOCK = {
  id: ID_MOCK,
  chainId: CHAIN_ID_MOCK,
  networkClientId: NETWORK_CLIENT_ID_MOCK,
  hash: '0x1',
  rawTx: '0x987',
  status: TransactionStatus.submitted,
  txParams: {
    nonce: NONCE_MOCK,
  },
} as unknown as TransactionMeta;

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

jest.mock('./TransactionPoller');

jest.mock('@metamask/controller-utils', () => ({
  query: jest.fn(),
}));

/**
 * Creates a mock block tracker instance.
 *
 * @returns The mock block tracker instance.
 */
function createBlockTrackerMock(): jest.Mocked<BlockTracker> {
  return {
    on: jest.fn(),
    removeListener: jest.fn(),
  } as unknown as jest.Mocked<BlockTracker>;
}

/**
 * Creates a mock transaction poller instance.
 *
 * @returns The mock transaction poller instance.
 */
function createTransactionPollerMock(): jest.Mocked<TransactionPoller> {
  return {
    start: jest.fn(),
    stop: jest.fn(),
    setPendingTransactions: jest.fn(),
  } as unknown as jest.Mocked<TransactionPoller>;
}

/**
 * Creates a mock messenger instance.
 *
 * @returns The mock messenger instance.
 */
function createMessengerMock(): jest.Mocked<TransactionControllerMessenger> {
  return {
    call: jest.fn().mockReturnValue({
      remoteFeatureFlags: {},
    }),
  } as unknown as jest.Mocked<TransactionControllerMessenger>;
}

/**
 * Mocks the feature flags for the given messenger.
 *
 * @param messenger - Messenger to mock the feature flags for.
 * @param featureFlags - Feature flags to mock.
 */
function mockFeatureFlags(
  messenger: jest.Mocked<TransactionControllerMessenger>,
  featureFlags: Json,
): void {
  messenger.call.mockReturnValue({
    remoteFeatureFlags: featureFlags,
  } as never);
}

describe('PendingTransactionTracker', () => {
  const getTransactionReceiptMock = jest.fn();
  const getTransactionByHashMock = jest.fn();
  const getTransactionCountMock = jest.fn();
  const getBlockByHashMock = jest.fn();

  let blockTracker: jest.Mocked<BlockTracker>;
  let pendingTransactionTracker: PendingTransactionTracker;
  let transactionPoller: jest.Mocked<TransactionPoller>;
  let messenger: jest.Mocked<TransactionControllerMessenger>;

  let options: jest.Mocked<
    ConstructorParameters<typeof PendingTransactionTracker>[0]
  >;

  /**
   * Simulates a poll event.
   *
   * @param latestBlockNumber - The latest block number.
   * @param transactionsOnCheck - The current transactions during the check.
   */
  async function onPoll(
    latestBlockNumber?: string,
    transactionsOnCheck?: TransactionMeta[],
  ): Promise<void> {
    options.getTransactions.mockReturnValue([
      { ...TRANSACTION_SUBMITTED_MOCK },
    ]);

    pendingTransactionTracker.startIfPendingTransactions();

    if (transactionsOnCheck) {
      options.getTransactions.mockReturnValue(
        freeze(transactionsOnCheck, true),
      );
    }

    await transactionPoller.start.mock.calls[0][0](latestBlockNumber as string);
  }

  beforeEach(() => {
    blockTracker = createBlockTrackerMock();
    transactionPoller = createTransactionPollerMock();
    messenger = createMessengerMock();

    jest.mocked(TransactionPoller).mockImplementation(() => transactionPoller);

    jest.mocked(query).mockImplementation(
      // Query arguments are not typed
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (_ethQuery, method, args: any[] = []) => {
        switch (method) {
          case 'getTransactionReceipt':
            return getTransactionReceiptMock(...args);
          case 'getTransactionByHash':
            return getTransactionByHashMock(...args);
          case 'getTransactionCount':
            return getTransactionCountMock(...args);
          case 'getBlockByHash':
            return getBlockByHashMock(...args);
          default:
            return undefined;
        }
      },
    );

    options = {
      blockTracker,
      getChainId: jest.fn(() => CHAIN_ID_MOCK),
      getEthQuery: jest.fn(() => ETH_QUERY_MOCK),
      getNetworkClientId: jest.fn(() => NETWORK_CLIENT_ID_MOCK),
      getTransactions: jest.fn(),
      getGlobalLock: jest.fn(() => Promise.resolve(jest.fn())),
      isTimeoutEnabled: jest.fn((_transactionMeta: TransactionMeta) => true),
      publishTransaction: jest.fn(),
      messenger,
    };
  });

  describe('on state change', () => {
    it('adds listener if pending transactions', () => {
      pendingTransactionTracker = new PendingTransactionTracker(options);

      options.getTransactions.mockReturnValue(
        freeze([TRANSACTION_SUBMITTED_MOCK], true),
      );

      pendingTransactionTracker.startIfPendingTransactions();

      expect(transactionPoller.start).toHaveBeenCalledTimes(1);
      expect(transactionPoller.start).toHaveBeenCalledWith(
        expect.any(Function),
      );
    });

    it('does nothing if listener already added', () => {
      pendingTransactionTracker = new PendingTransactionTracker(options);

      options.getTransactions.mockReturnValue(
        freeze([TRANSACTION_SUBMITTED_MOCK], true),
      );

      pendingTransactionTracker.startIfPendingTransactions();
      pendingTransactionTracker.startIfPendingTransactions();

      expect(transactionPoller.start).toHaveBeenCalledTimes(1);
      expect(transactionPoller.stop).toHaveBeenCalledTimes(0);
    });

    it('removes listener if no pending transactions and running', () => {
      pendingTransactionTracker = new PendingTransactionTracker(options);

      options.getTransactions.mockReturnValue(
        freeze([TRANSACTION_SUBMITTED_MOCK], true),
      );

      pendingTransactionTracker.startIfPendingTransactions();

      expect(transactionPoller.stop).toHaveBeenCalledTimes(0);

      options.getTransactions.mockReturnValue([]);

      pendingTransactionTracker.startIfPendingTransactions();

      expect(transactionPoller.stop).toHaveBeenCalledTimes(1);
    });

    it('does nothing if listener already removed', () => {
      pendingTransactionTracker = new PendingTransactionTracker(options);

      options.getTransactions.mockReturnValue(
        freeze([TRANSACTION_SUBMITTED_MOCK], true),
      );

      pendingTransactionTracker.startIfPendingTransactions();

      expect(blockTracker.removeListener).toHaveBeenCalledTimes(0);

      options.getTransactions.mockReturnValue([]);

      pendingTransactionTracker.startIfPendingTransactions();

      expect(transactionPoller.stop).toHaveBeenCalledTimes(1);

      pendingTransactionTracker.startIfPendingTransactions();

      expect(transactionPoller.stop).toHaveBeenCalledTimes(1);
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

          await onPoll(undefined, [
            {
              ...TRANSACTION_SUBMITTED_MOCK,
              status: TransactionStatus.dropped,
            },
            {
              ...TRANSACTION_SUBMITTED_MOCK,
              networkClientId: 'other-network-client-id',
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
            getTransactions: (): TransactionMeta[] =>
              freeze([{ ...TRANSACTION_SUBMITTED_MOCK }], true),
          });

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

          getTransactionReceiptMock.mockResolvedValueOnce(undefined);
          getTransactionCountMock.mockResolvedValueOnce('0x1');

          await onPoll();

          expect(listener).toHaveBeenCalledTimes(0);
        });

        it('if receipt has no status', async () => {
          const listener = jest.fn();

          pendingTransactionTracker = new PendingTransactionTracker({
            ...options,
            getTransactions: (): TransactionMeta[] =>
              freeze([{ ...TRANSACTION_SUBMITTED_MOCK }], true),
          });

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

          getTransactionReceiptMock.mockResolvedValueOnce({
            ...RECEIPT_MOCK,
            status: null,
          });
          getTransactionCountMock.mockResolvedValueOnce('0x1');

          await onPoll();

          expect(listener).toHaveBeenCalledTimes(0);
        });

        it('if receipt has invalid status', async () => {
          const listener = jest.fn();

          pendingTransactionTracker = new PendingTransactionTracker({
            ...options,
            getTransactions: (): TransactionMeta[] =>
              freeze([{ ...TRANSACTION_SUBMITTED_MOCK }], true),
          });

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

          getTransactionReceiptMock.mockResolvedValueOnce({
            ...RECEIPT_MOCK,
            status: '0x3',
          });
          getTransactionCountMock.mockResolvedValueOnce('0x1');

          await onPoll();

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
            getTransactions: (): TransactionMeta[] =>
              freeze([transactionMetaMock], true),
          });

          pendingTransactionTracker.hub.addListener(
            'transaction-failed',
            listener,
          );

          await onPoll();

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
            getTransactions: (): TransactionMeta[] =>
              freeze([transactionMetaMock], true),
            hooks: {
              beforeCheckPendingTransaction: (): Promise<boolean> =>
                Promise.resolve(false),
            },
          });

          pendingTransactionTracker.hub.addListener(
            'transaction-failed',
            listener,
          );

          await onPoll();

          expect(listener).toHaveBeenCalledTimes(0);
        });

        it('if receipt has error status', async () => {
          const listener = jest.fn();

          pendingTransactionTracker = new PendingTransactionTracker({
            ...options,
            getTransactions: (): TransactionMeta[] =>
              freeze([{ ...TRANSACTION_SUBMITTED_MOCK }], true),
          });

          pendingTransactionTracker.hub.addListener(
            'transaction-failed',
            listener,
          );

          getTransactionReceiptMock.mockResolvedValueOnce({
            ...RECEIPT_MOCK,
            status: '0x0',
          });

          await onPoll();

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
          } as unknown as TransactionMeta;

          const submittedTransactionMetaMock = {
            ...TRANSACTION_SUBMITTED_MOCK,
          };

          pendingTransactionTracker = new PendingTransactionTracker({
            ...options,
            getTransactions: (): TransactionMeta[] =>
              freeze(
                [confirmedTransactionMetaMock, submittedTransactionMetaMock],
                true,
              ),
          });

          pendingTransactionTracker.hub.addListener(
            'transaction-dropped',
            listener,
          );

          await onPoll();

          expect(listener).toHaveBeenCalledTimes(1);
          expect(listener).toHaveBeenCalledWith(submittedTransactionMetaMock);
        });

        it('if nonce exceeded for 3 subsequent blocks', async () => {
          const listener = jest.fn();

          pendingTransactionTracker = new PendingTransactionTracker({
            ...options,
            getTransactions: (): TransactionMeta[] =>
              freeze([{ ...TRANSACTION_SUBMITTED_MOCK }], true),
          });

          pendingTransactionTracker.hub.addListener(
            'transaction-dropped',
            listener,
          );

          for (let i = 0; i < 4; i++) {
            expect(listener).toHaveBeenCalledTimes(0);

            getTransactionReceiptMock.mockResolvedValueOnce(undefined);
            getTransactionCountMock.mockResolvedValueOnce('0x3');

            await onPoll();
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
          } as unknown as TransactionMeta;

          const submittedTransactionMetaMock = {
            ...TRANSACTION_SUBMITTED_MOCK,
          };

          pendingTransactionTracker = new PendingTransactionTracker({
            ...options,
            getTransactions: (): TransactionMeta[] => [
              confirmedTransactionMetaMock,
              submittedTransactionMetaMock,
            ],
          });

          pendingTransactionTracker.hub.addListener(
            'transaction-dropped',
            listener,
          );

          await onPoll();

          expect(listener).not.toHaveBeenCalled();
        });

        it('unless no nonce', async () => {
          const listener = jest.fn();

          const confirmedTransactionMetaMock = {
            ...TRANSACTION_SUBMITTED_MOCK,
            id: `${ID_MOCK}2`,
            status: TransactionStatus.confirmed,
            txParams: {
              ...TRANSACTION_SUBMITTED_MOCK.txParams,
              nonce: undefined,
            },
          } as unknown as TransactionMeta;

          const submittedTransactionMetaMock = {
            ...TRANSACTION_SUBMITTED_MOCK,
            txParams: {
              ...TRANSACTION_SUBMITTED_MOCK.txParams,
              nonce: undefined,
            },
          };

          pendingTransactionTracker = new PendingTransactionTracker({
            ...options,
            getTransactions: (): TransactionMeta[] => [
              confirmedTransactionMetaMock,
              submittedTransactionMetaMock,
            ],
          });

          pendingTransactionTracker.hub.addListener(
            'transaction-dropped',
            listener,
          );

          await onPoll();

          expect(listener).not.toHaveBeenCalled();
        });

        it('unless incoming transaction', async () => {
          const listener = jest.fn();

          const confirmedTransactionMetaMock = {
            ...TRANSACTION_SUBMITTED_MOCK,
            id: `${ID_MOCK}2`,
            status: TransactionStatus.confirmed,
            isTransfer: false,
          } as unknown as TransactionMeta;

          const submittedTransactionMetaMock = {
            ...TRANSACTION_SUBMITTED_MOCK,
          };

          pendingTransactionTracker = new PendingTransactionTracker({
            ...options,
            getTransactions: (): TransactionMeta[] => [
              confirmedTransactionMetaMock,
              submittedTransactionMetaMock,
            ],
          });

          pendingTransactionTracker.hub.addListener(
            'transaction-dropped',
            listener,
          );

          await onPoll();

          expect(listener).not.toHaveBeenCalled();
        });
      });

      describe('fires confirmed event', () => {
        it('if receipt has success status', async () => {
          const transaction = { ...TRANSACTION_SUBMITTED_MOCK };
          const getTransactions = jest
            .fn()
            .mockReturnValue(freeze([transaction], true));

          pendingTransactionTracker = new PendingTransactionTracker({
            ...options,
            getTransactions,
          });

          const listener = jest.fn();
          pendingTransactionTracker.hub.addListener(
            'transaction-confirmed',
            listener,
          );

          getTransactionReceiptMock.mockResolvedValueOnce(RECEIPT_MOCK);
          getBlockByHashMock.mockResolvedValueOnce(BLOCK_MOCK);

          await onPoll();

          expect(listener).toHaveBeenCalledTimes(1);
          expect(listener).toHaveBeenCalledWith(
            expect.objectContaining({
              ...TRANSACTION_SUBMITTED_MOCK,
              txParams: expect.objectContaining(
                TRANSACTION_SUBMITTED_MOCK.txParams,
              ),
              baseFeePerGas: BLOCK_MOCK.baseFeePerGas,
              blockTimestamp: BLOCK_MOCK.timestamp,
              status: TransactionStatus.confirmed,
              txReceipt: RECEIPT_MOCK,
              verifiedOnBlockchain: true,
            }),
          );
        });

        it('if isIntentComplete is true', async () => {
          const transaction = {
            ...TRANSACTION_SUBMITTED_MOCK,
            isIntentComplete: true,
          };

          const getTransactions = jest
            .fn()
            .mockReturnValue(freeze([transaction], true));

          pendingTransactionTracker = new PendingTransactionTracker({
            ...options,
            getTransactions,
          });

          const listener = jest.fn();
          pendingTransactionTracker.hub.addListener(
            'transaction-confirmed',
            listener,
          );

          await onPoll();

          expect(listener).toHaveBeenCalledTimes(1);
          expect(listener).toHaveBeenCalledWith(
            expect.objectContaining({
              ...TRANSACTION_SUBMITTED_MOCK,
              txParams: expect.objectContaining(
                TRANSACTION_SUBMITTED_MOCK.txParams,
              ),
              status: TransactionStatus.confirmed,
            }),
          );
        });
      });

      describe('fires updated event', () => {
        it('if receipt has success status', async () => {
          const transaction = { ...TRANSACTION_SUBMITTED_MOCK };
          const getTransactions = jest
            .fn()
            .mockReturnValue(freeze([transaction], true));

          pendingTransactionTracker = new PendingTransactionTracker({
            ...options,
            getTransactions,
          });

          const listener = jest.fn();
          pendingTransactionTracker.hub.addListener(
            'transaction-updated',
            listener,
          );

          getTransactionReceiptMock.mockResolvedValueOnce(RECEIPT_MOCK);
          getBlockByHashMock.mockResolvedValueOnce(BLOCK_MOCK);

          await onPoll();

          expect(listener).toHaveBeenCalledTimes(2);
          expect(listener).toHaveBeenCalledWith(
            expect.objectContaining({
              ...TRANSACTION_SUBMITTED_MOCK,
              txParams: expect.objectContaining(
                TRANSACTION_SUBMITTED_MOCK.txParams,
              ),
              baseFeePerGas: BLOCK_MOCK.baseFeePerGas,
              blockTimestamp: BLOCK_MOCK.timestamp,
              status: TransactionStatus.confirmed,
              txReceipt: RECEIPT_MOCK,
              verifiedOnBlockchain: true,
            }),
            'PendingTransactionTracker:#onTransactionConfirmed - Transaction confirmed',
          );
        });

        it('if getTransactionReceipt fails', async () => {
          const transaction = { ...TRANSACTION_SUBMITTED_MOCK };
          const getTransactions = jest
            .fn()
            .mockReturnValue(freeze([transaction], true));

          pendingTransactionTracker = new PendingTransactionTracker({
            ...options,
            getTransactions,
          });

          const listener = jest.fn();
          pendingTransactionTracker.hub.addListener(
            'transaction-updated',
            listener,
          );

          getBlockByHashMock.mockResolvedValueOnce(BLOCK_MOCK);
          getTransactionReceiptMock.mockRejectedValueOnce(
            new Error('TestError'),
          );

          await onPoll(BLOCK_NUMBER_MOCK);
          getTransactions.mockReturnValue(
            freeze(
              [
                {
                  ...transaction,
                  firstRetryBlockNumber: BLOCK_NUMBER_MOCK,
                },
              ],
              true,
            ),
          );

          expect(listener).toHaveBeenCalledTimes(2);
          expect(listener).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
              ...TRANSACTION_SUBMITTED_MOCK,
              warning: {
                error: 'TestError',
                message: 'There was a problem loading this transaction.',
              },
            }),
            'PendingTransactionTracker:#warnTransaction - Warning added',
          );
        });
      });
    });

    describe('resubmits', () => {
      describe('does nothing', () => {
        it('if no pending transactions', async () => {
          pendingTransactionTracker = new PendingTransactionTracker(options);

          await onPoll(undefined, []);

          expect(options.publishTransaction).toHaveBeenCalledTimes(0);
        });
      });

      describe('fires updated event', () => {
        it('if first retry check', async () => {
          const listener = jest.fn();

          pendingTransactionTracker = new PendingTransactionTracker({
            ...options,
            getTransactions: (): TransactionMeta[] =>
              freeze([{ ...TRANSACTION_SUBMITTED_MOCK }], true),
          });

          pendingTransactionTracker.hub.addListener(
            'transaction-updated',
            listener,
          );

          getTransactionReceiptMock.mockResolvedValueOnce(undefined);
          getTransactionCountMock.mockResolvedValueOnce('0x1');

          await onPoll(BLOCK_NUMBER_MOCK);

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
          const transaction = { ...TRANSACTION_SUBMITTED_MOCK };
          const getTransactions = jest
            .fn()
            .mockReturnValue(freeze([transaction], true));

          pendingTransactionTracker = new PendingTransactionTracker({
            ...options,
            getTransactions,
          });

          const listener = jest.fn();
          pendingTransactionTracker.hub.addListener(
            'transaction-updated',
            listener,
          );

          getTransactionReceiptMock.mockResolvedValueOnce(undefined);
          getTransactionCountMock.mockResolvedValueOnce('0x1');

          await onPoll(BLOCK_NUMBER_MOCK);
          getTransactions.mockReturnValue(
            freeze(
              [
                {
                  ...transaction,
                  firstRetryBlockNumber: BLOCK_NUMBER_MOCK,
                },
              ],
              true,
            ),
          );
          await onPoll('0x124');

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

        it('if beforeCheckPendingTransaction returns false, does not resubmit the transaction', async () => {
          const transaction = { ...TRANSACTION_SUBMITTED_MOCK };
          const getTransactions = jest
            .fn()
            .mockReturnValue(freeze([transaction], true));

          pendingTransactionTracker = new PendingTransactionTracker({
            ...options,
            getTransactions,
            hooks: {
              beforeCheckPendingTransaction: (): Promise<boolean> =>
                Promise.resolve(false),
            },
          });

          const listener = jest.fn();
          pendingTransactionTracker.hub.addListener(
            'transaction-updated',
            listener,
          );

          getTransactionReceiptMock.mockResolvedValueOnce(undefined);
          getTransactionCountMock.mockResolvedValueOnce('0x1');

          await onPoll(BLOCK_NUMBER_MOCK);
          getTransactions.mockReturnValue(
            freeze(
              [
                {
                  ...transaction,
                  firstRetryBlockNumber: BLOCK_NUMBER_MOCK,
                },
              ],
              true,
            ),
          );
          await onPoll('0x124');

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
          const transaction = { ...TRANSACTION_SUBMITTED_MOCK };
          const getTransactions = jest
            .fn()
            .mockReturnValue(freeze([transaction], true));

          pendingTransactionTracker = new PendingTransactionTracker({
            ...options,
            getTransactions,
          });

          const listener = jest.fn();
          pendingTransactionTracker.hub.addListener(
            'transaction-updated',
            listener,
          );

          getTransactionReceiptMock.mockResolvedValueOnce(undefined);
          getTransactionCountMock.mockResolvedValueOnce('0x1');

          options.publishTransaction.mockRejectedValueOnce(
            new Error('TestError'),
          );

          await onPoll(BLOCK_NUMBER_MOCK);
          getTransactions.mockReturnValue(
            freeze(
              [
                {
                  ...transaction,
                  firstRetryBlockNumber: BLOCK_NUMBER_MOCK,
                },
              ],
              true,
            ),
          );
          await onPoll('0x124');

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
          const transaction = { ...TRANSACTION_SUBMITTED_MOCK };
          const getTransactions = jest
            .fn()
            .mockReturnValue(freeze([transaction], true));

          pendingTransactionTracker = new PendingTransactionTracker({
            ...options,
            getTransactions,
          });

          const listener = jest.fn();
          pendingTransactionTracker.hub.addListener(
            'transaction-updated',
            listener,
          );

          getTransactionReceiptMock.mockResolvedValueOnce(undefined);
          getTransactionCountMock.mockResolvedValueOnce('0x1');

          options.publishTransaction.mockRejectedValueOnce(
            new Error('test gas price too low to replace test'),
          );

          await onPoll(BLOCK_NUMBER_MOCK);
          getTransactions.mockReturnValue(
            freeze(
              [
                {
                  ...transaction,
                  firstRetryBlockNumber: BLOCK_NUMBER_MOCK,
                },
              ],
              true,
            ),
          );
          await onPoll('0x124');

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
          const getTransactions = jest
            .fn()
            .mockReturnValue(freeze([transaction], true));

          pendingTransactionTracker = new PendingTransactionTracker({
            ...options,
            getTransactions,
          });

          getTransactionReceiptMock.mockResolvedValueOnce(undefined);
          getTransactionCountMock.mockResolvedValueOnce('0x1');

          await onPoll(BLOCK_NUMBER_MOCK);
          getTransactions.mockReturnValue(
            freeze(
              [
                {
                  ...transaction,
                  firstRetryBlockNumber: BLOCK_NUMBER_MOCK,
                },
              ],
              true,
            ),
          );
          await onPoll('0x124');

          expect(options.publishTransaction).toHaveBeenCalledTimes(1);
          expect(options.publishTransaction).toHaveBeenCalledWith(
            ETH_QUERY_MOCK,
            {
              ...TRANSACTION_SUBMITTED_MOCK,
              firstRetryBlockNumber: BLOCK_NUMBER_MOCK,
            },
          );
        });

        it('if latest block number matches retry count exponential delay', async () => {
          const transaction = { ...TRANSACTION_SUBMITTED_MOCK };
          const getTransactions = jest
            .fn()
            .mockReturnValue(freeze([transaction], true));

          pendingTransactionTracker = new PendingTransactionTracker({
            ...options,
            getTransactions,
          });

          getTransactionReceiptMock.mockResolvedValueOnce(undefined);
          getTransactionCountMock.mockResolvedValueOnce('0x1');

          await onPoll(BLOCK_NUMBER_MOCK);
          expect(options.publishTransaction).toHaveBeenCalledTimes(0);
          getTransactions.mockReturnValue(
            freeze(
              [
                {
                  ...transaction,
                  firstRetryBlockNumber: BLOCK_NUMBER_MOCK,
                },
              ],
              true,
            ),
          );

          await onPoll('0x124');
          expect(options.publishTransaction).toHaveBeenCalledTimes(1);
          getTransactions.mockReturnValue(
            freeze(
              [
                {
                  ...transaction,
                  firstRetryBlockNumber: BLOCK_NUMBER_MOCK,
                  retryCount: 1,
                },
              ],
              true,
            ),
          );

          await onPoll('0x125');
          expect(options.publishTransaction).toHaveBeenCalledTimes(2);
          getTransactions.mockReturnValue(
            freeze(
              [
                {
                  ...transaction,
                  firstRetryBlockNumber: BLOCK_NUMBER_MOCK,
                  retryCount: 2,
                },
              ],
              true,
            ),
          );

          await onPoll('0x126');
          expect(options.publishTransaction).toHaveBeenCalledTimes(2);

          await onPoll('0x127');
          expect(options.publishTransaction).toHaveBeenCalledTimes(3);
          getTransactions.mockReturnValue(
            freeze(
              [
                {
                  ...transaction,
                  firstRetryBlockNumber: BLOCK_NUMBER_MOCK,
                  retryCount: 3,
                },
              ],
              true,
            ),
          );

          await onPoll('0x12A');
          expect(options.publishTransaction).toHaveBeenCalledTimes(3);

          await onPoll('0x12B');
          expect(options.publishTransaction).toHaveBeenCalledTimes(4);
        });

        it('unless resubmit disabled', async () => {
          const transaction = { ...TRANSACTION_SUBMITTED_MOCK };
          const getTransactions = jest
            .fn()
            .mockReturnValueOnce(freeze([transaction], true));

          pendingTransactionTracker = new PendingTransactionTracker({
            ...options,
            getTransactions,
            isResubmitEnabled: (): boolean => false,
          });

          getTransactionReceiptMock.mockResolvedValueOnce(undefined);
          getTransactionCountMock.mockResolvedValueOnce('0x1');

          await onPoll(BLOCK_NUMBER_MOCK);

          getTransactions.mockReturnValue(
            freeze(
              [
                {
                  ...transaction,
                  firstRetryBlockNumber: BLOCK_NUMBER_MOCK,
                },
              ],
              true,
            ),
          );

          await onPoll('0x124');

          expect(options.publishTransaction).toHaveBeenCalledTimes(0);
        });
      });
    });
  });

  describe('forceCheckTransaction', () => {
    let tracker: PendingTransactionTracker;
    let transactionMeta: TransactionMeta;

    beforeEach(() => {
      tracker = new PendingTransactionTracker(options);
      transactionMeta = {
        ...TRANSACTION_SUBMITTED_MOCK,
        hash: '0x123',
      } as TransactionMeta;
    });

    it('should update transaction status to confirmed if receipt status is success', async () => {
      getTransactionReceiptMock.mockResolvedValueOnce(RECEIPT_MOCK);
      getBlockByHashMock.mockResolvedValueOnce(BLOCK_MOCK);
      options.getTransactions.mockReturnValue([]);

      const listener = jest.fn();
      tracker.hub.addListener('transaction-updated', listener);

      await tracker.forceCheckTransaction(transactionMeta);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          ...transactionMeta,
          txParams: expect.objectContaining(transactionMeta.txParams),
          status: TransactionStatus.confirmed,
          txReceipt: RECEIPT_MOCK,
          verifiedOnBlockchain: true,
        }),
        'PendingTransactionTracker:#onTransactionConfirmed - Transaction confirmed',
      );
    });

    it('should fail transaction if receipt status is failure', async () => {
      const receiptMock = { ...RECEIPT_MOCK, status: '0x0' };
      getTransactionReceiptMock.mockResolvedValueOnce(receiptMock);
      options.getTransactions.mockReturnValue([]);

      const listener = jest.fn();
      tracker.hub.addListener('transaction-failed', listener);

      await tracker.forceCheckTransaction(transactionMeta);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        transactionMeta,
        new Error('Transaction dropped or replaced'),
      );
    });

    it('should not change transaction status if receipt status is neither success nor failure', async () => {
      const receiptMock = { ...RECEIPT_MOCK, status: '0x2' };
      getTransactionReceiptMock.mockResolvedValueOnce(receiptMock);
      options.getTransactions.mockReturnValue([]);

      await tracker.forceCheckTransaction(transactionMeta);

      expect(transactionMeta.status).toStrictEqual(TransactionStatus.submitted);
      expect(transactionMeta.txReceipt).toBeUndefined();
    });
  });

  describe('addTransactionToPoll', () => {
    it('adds a transaction to poll and sets #transactionToForcePoll', () => {
      pendingTransactionTracker = new PendingTransactionTracker(options);

      pendingTransactionTracker.addTransactionToPoll(
        TRANSACTION_SUBMITTED_MOCK,
      );

      expect(transactionPoller.setPendingTransactions).toHaveBeenCalledWith([
        TRANSACTION_SUBMITTED_MOCK,
      ]);
      expect(transactionPoller.start).toHaveBeenCalledTimes(1);
    });

    describe('emits confirm event and clean transactionToForcePoll', () => {
      it('if receipt has success status', async () => {
        const transaction = { ...TRANSACTION_SUBMITTED_MOCK };
        const getTransactions = jest
          .fn()
          .mockReturnValue(freeze([transaction], true));

        pendingTransactionTracker = new PendingTransactionTracker({
          ...options,
          getTransactions,
        });

        pendingTransactionTracker.addTransactionToPoll(
          TRANSACTION_SUBMITTED_MOCK,
        );

        const listener = jest.fn();
        pendingTransactionTracker.hub.addListener(
          'transaction-confirmed',
          listener,
        );

        getTransactionReceiptMock.mockResolvedValueOnce(RECEIPT_MOCK);
        getBlockByHashMock.mockResolvedValueOnce(BLOCK_MOCK);

        await onPoll();

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith(
          expect.objectContaining(TRANSACTION_SUBMITTED_MOCK),
        );
      });
    });
  });

  describe('timeout', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(0);

      mockFeatureFlags(messenger, {
        confirmations_transactions: {
          timeoutAttempts: {
            default: 3,
          },
          acceleratedPolling: {
            perChainConfig: {
              [CHAIN_ID_MOCK]: {
                blockTime: 12000,
              },
            },
          },
        },
      });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    describe('does not timeout', () => {
      it('if isTimeoutEnabled returns false', async () => {
        const listener = jest.fn();
        const isTimeoutEnabled = jest.fn().mockReturnValue(false);
        const submittedTime = Date.now();

        pendingTransactionTracker = new PendingTransactionTracker({
          ...options,
          getTransactions: (): TransactionMeta[] =>
            freeze([{ ...TRANSACTION_SUBMITTED_MOCK, submittedTime }], true),
          isTimeoutEnabled,
        });

        pendingTransactionTracker.hub.addListener(
          'transaction-failed',
          listener,
        );

        getTransactionReceiptMock.mockResolvedValueOnce(undefined);
        getTransactionCountMock.mockResolvedValueOnce('0x3');
        getTransactionByHashMock.mockResolvedValueOnce(null);

        jest.advanceTimersByTime(20000); // Advance past blockTime

        await onPoll();

        expect(isTimeoutEnabled).toHaveBeenCalledWith(
          expect.objectContaining(TRANSACTION_SUBMITTED_MOCK),
        );
        expect(listener).toHaveBeenCalledTimes(0);
      });

      it('if timeout threshold is undefined', async () => {
        const listener = jest.fn();
        const submittedTime = Date.now();

        mockFeatureFlags(messenger, {});

        pendingTransactionTracker = new PendingTransactionTracker({
          ...options,
          getTransactions: (): TransactionMeta[] =>
            freeze([{ ...TRANSACTION_SUBMITTED_MOCK, submittedTime }], true),
        });

        pendingTransactionTracker.hub.addListener(
          'transaction-failed',
          listener,
        );

        getTransactionReceiptMock.mockResolvedValueOnce(undefined);
        getTransactionCountMock.mockResolvedValueOnce('0x3');
        getTransactionByHashMock.mockResolvedValueOnce(null);

        jest.advanceTimersByTime(20000); // Advance past blockTime

        await onPoll();

        expect(listener).toHaveBeenCalledTimes(0);
      });

      it('if timeout threshold is zero', async () => {
        const listener = jest.fn();
        const submittedTime = Date.now();

        mockFeatureFlags(messenger, {
          confirmations_transactions: {
            timeoutAttempts: {
              default: 0,
            },
          },
        });

        pendingTransactionTracker = new PendingTransactionTracker({
          ...options,
          getTransactions: (): TransactionMeta[] =>
            freeze([{ ...TRANSACTION_SUBMITTED_MOCK, submittedTime }], true),
        });

        pendingTransactionTracker.hub.addListener(
          'transaction-failed',
          listener,
        );

        getTransactionReceiptMock.mockResolvedValueOnce(undefined);
        getTransactionCountMock.mockResolvedValueOnce('0x3');
        getTransactionByHashMock.mockResolvedValueOnce(null);

        jest.advanceTimersByTime(20000); // Advance past blockTime

        await onPoll();

        expect(listener).toHaveBeenCalledTimes(0);
      });

      it('if transaction nonce is greater than next nonce', async () => {
        const listener = jest.fn();
        const submittedTime = Date.now();

        pendingTransactionTracker = new PendingTransactionTracker({
          ...options,
          getTransactions: (): TransactionMeta[] =>
            freeze([{ ...TRANSACTION_SUBMITTED_MOCK, submittedTime }], true),
        });

        pendingTransactionTracker.hub.addListener(
          'transaction-failed',
          listener,
        );

        getTransactionReceiptMock.mockResolvedValueOnce(undefined);
        getTransactionCountMock.mockResolvedValueOnce('0x1');
        getTransactionByHashMock.mockResolvedValueOnce(null);

        jest.advanceTimersByTime(20000); // Advance past blockTime

        await onPoll();

        expect(listener).toHaveBeenCalledTimes(0);
      });

      it('if transaction has no hash', async () => {
        const listener = jest.fn();
        const submittedTime = Date.now();
        const transactionWithoutHash = {
          ...TRANSACTION_SUBMITTED_MOCK,
          hash: undefined,
          submittedTime,
        };

        pendingTransactionTracker = new PendingTransactionTracker({
          ...options,
          getTransactions: (): TransactionMeta[] =>
            freeze([transactionWithoutHash], true),
          hooks: {
            beforeCheckPendingTransaction: (): Promise<boolean> =>
              Promise.resolve(false),
          },
        });

        pendingTransactionTracker.hub.addListener(
          'transaction-failed',
          listener,
        );

        getTransactionReceiptMock.mockResolvedValueOnce(undefined);
        getTransactionCountMock.mockResolvedValueOnce('0x3');

        jest.advanceTimersByTime(20000); // Advance past blockTime

        await onPoll();

        expect(listener).toHaveBeenCalledTimes(0);
      });

      it('if transaction has no nonce', async () => {
        const listener = jest.fn();
        const submittedTime = Date.now();
        const transactionWithoutNonce = {
          ...TRANSACTION_SUBMITTED_MOCK,
          txParams: {
            ...TRANSACTION_SUBMITTED_MOCK.txParams,
            nonce: undefined,
          },
          submittedTime,
        };

        pendingTransactionTracker = new PendingTransactionTracker({
          ...options,
          getTransactions: (): TransactionMeta[] =>
            freeze([transactionWithoutNonce], true),
        });

        pendingTransactionTracker.hub.addListener(
          'transaction-failed',
          listener,
        );

        getTransactionReceiptMock.mockResolvedValueOnce(undefined);
        getTransactionCountMock.mockResolvedValueOnce('0x3');

        jest.advanceTimersByTime(50000); // Advance past blockTime * threshold

        await onPoll();

        expect(listener).toHaveBeenCalledTimes(0);
      });

      it('if transaction has no submittedTime', async () => {
        const listener = jest.fn();
        const transactionWithoutSubmittedTime = {
          ...TRANSACTION_SUBMITTED_MOCK,
          submittedTime: undefined,
        };

        pendingTransactionTracker = new PendingTransactionTracker({
          ...options,
          getTransactions: (): TransactionMeta[] =>
            freeze([transactionWithoutSubmittedTime], true),
        });

        pendingTransactionTracker.hub.addListener(
          'transaction-failed',
          listener,
        );

        getTransactionReceiptMock.mockResolvedValueOnce(undefined);
        getTransactionCountMock.mockResolvedValueOnce('0x3');
        getTransactionByHashMock.mockResolvedValueOnce(null);

        jest.advanceTimersByTime(50000); // Advance past blockTime * threshold

        await onPoll();

        expect(listener).toHaveBeenCalledTimes(0);
      });
    });

    describe('resets timeout counter', () => {
      it('when transaction is found on network', async () => {
        const listener = jest.fn();
        const submittedTime = Date.now();

        pendingTransactionTracker = new PendingTransactionTracker({
          ...options,
          getTransactions: (): TransactionMeta[] =>
            freeze([{ ...TRANSACTION_SUBMITTED_MOCK, submittedTime }], true),
        });

        pendingTransactionTracker.hub.addListener(
          'transaction-failed',
          listener,
        );

        // First check - transaction not found, advance time slightly
        getTransactionReceiptMock.mockResolvedValueOnce(undefined);
        getTransactionCountMock.mockResolvedValueOnce('0x3');
        getTransactionByHashMock.mockResolvedValueOnce(null);

        jest.advanceTimersByTime(10000); // Advance 10 seconds

        await onPoll();

        expect(listener).toHaveBeenCalledTimes(0);

        // Second check - transaction found on network, this resets the timestamp
        getTransactionReceiptMock.mockResolvedValueOnce(undefined);
        getTransactionCountMock.mockResolvedValueOnce('0x3');
        getTransactionByHashMock.mockResolvedValueOnce({ hash: '0x1' });

        jest.advanceTimersByTime(10000); // Advance another 10 seconds

        await onPoll();

        expect(listener).toHaveBeenCalledTimes(0);

        // Third check - transaction not found again (timestamp should have been reset)
        // Even though we advance by 30 seconds (10 + 10 + 10), since timestamp was reset
        // the duration since last seen should only be 10 seconds, which is less than
        // the timeout duration (blockTime=12000ms * threshold=3 = 36000ms)
        getTransactionReceiptMock.mockResolvedValueOnce(undefined);
        getTransactionCountMock.mockResolvedValueOnce('0x3');
        getTransactionByHashMock.mockResolvedValueOnce(null);

        jest.advanceTimersByTime(10000); // Advance another 10 seconds

        await onPoll();

        // Should not fail because timestamp was reset
        expect(listener).toHaveBeenCalledTimes(0);
      });
    });

    describe('fails transaction', () => {
      it('when timeout threshold is reached', async () => {
        const listener = jest.fn();
        const submittedTime = Date.now();

        pendingTransactionTracker = new PendingTransactionTracker({
          ...options,
          getTransactions: (): TransactionMeta[] =>
            freeze([{ ...TRANSACTION_SUBMITTED_MOCK, submittedTime }], true),
        });

        pendingTransactionTracker.hub.addListener(
          'transaction-failed',
          listener,
        );

        // First poll - transaction not found, time hasn't elapsed
        getTransactionReceiptMock.mockResolvedValueOnce(undefined);
        getTransactionCountMock.mockResolvedValueOnce('0x3');
        getTransactionByHashMock.mockResolvedValueOnce(null);

        jest.advanceTimersByTime(10000); // Advance 10 seconds

        await onPoll();
        expect(listener).toHaveBeenCalledTimes(0);

        // Second poll - still under timeout (threshold=3, blockTime=12000ms, timeout=36000ms)
        getTransactionReceiptMock.mockResolvedValueOnce(undefined);
        getTransactionCountMock.mockResolvedValueOnce('0x3');
        getTransactionByHashMock.mockResolvedValueOnce(null);

        jest.advanceTimersByTime(20000); // Advance 20 more seconds (total: 30 seconds)

        await onPoll();
        expect(listener).toHaveBeenCalledTimes(0);

        // Third poll - should fail as we exceed timeout threshold
        getTransactionReceiptMock.mockResolvedValueOnce(undefined);
        getTransactionCountMock.mockResolvedValueOnce('0x3');
        getTransactionByHashMock.mockResolvedValueOnce(null);

        jest.advanceTimersByTime(10000); // Advance 10 more seconds (total: 40 seconds > 36 seconds)

        await onPoll();

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith(
          expect.objectContaining(TRANSACTION_SUBMITTED_MOCK),
          new Error('Transaction not found on network after timeout'),
        );
      });
    });

    describe('error handling', () => {
      it('does not fail transaction if getTransactionByHash throws error', async () => {
        const listener = jest.fn();
        const submittedTime = Date.now();

        pendingTransactionTracker = new PendingTransactionTracker({
          ...options,
          getTransactions: (): TransactionMeta[] =>
            freeze([{ ...TRANSACTION_SUBMITTED_MOCK, submittedTime }], true),
        });

        pendingTransactionTracker.hub.addListener(
          'transaction-failed',
          listener,
        );

        getTransactionReceiptMock.mockResolvedValueOnce(undefined);
        getTransactionCountMock.mockResolvedValueOnce('0x3');
        getTransactionByHashMock.mockRejectedValueOnce(
          new Error('Network error'),
        );

        jest.advanceTimersByTime(50000); // Advance past timeout threshold

        await onPoll();

        expect(listener).toHaveBeenCalledTimes(0);
      });
    });
  });
});
