/* eslint-disable jest/prefer-spy-on */
/* eslint-disable jsdoc/require-jsdoc */

import { flushPromises } from '../../../../tests/helpers';
import {
  TransactionStatus,
  type RemoteTransactionSource,
  type TransactionMeta,
} from '../types';
import { IncomingTransactionHelper } from './IncomingTransactionHelper';

jest.useFakeTimers();

jest.mock('@metamask/controller-utils', () => ({
  ...jest.requireActual('@metamask/controller-utils'),
  isSmartContractCode: jest.fn(),
  query: () => Promise.resolve({}),
}));

console.error = jest.fn();

const CHAIN_ID_MOCK = '0x1' as const;
const ADDRESS_MOCK = '0x1';
const FROM_BLOCK_DECIMAL_MOCK = 32;

const CONTROLLER_ARGS_MOCK = {
  getCurrentAccount: () => {
    return {
      id: '58def058-d35f-49a1-a7ab-e2580565f6f5',
      address: ADDRESS_MOCK,
      type: 'eip155:eoa' as const,
      options: {},
      methods: [],
      metadata: {
        name: 'Account 1',
        keyring: { type: 'HD Key Tree' },
        importTime: 1631619180000,
        lastSelected: 1631619180000,
      },
    };
  },
  getLastFetchedBlockNumbers: () => ({}),
  getChainIds: () => [CHAIN_ID_MOCK],
  remoteTransactionSource: {} as RemoteTransactionSource,
  transactionLimit: 1,
};

const TRANSACTION_MOCK: TransactionMeta = {
  blockNumber: '123',
  chainId: '0x1',
  hash: '0x1',
  status: TransactionStatus.submitted,
  time: 0,
  txParams: { to: '0x1', gasUsed: '0x1' },
} as unknown as TransactionMeta;

const TRANSACTION_MOCK_2: TransactionMeta = {
  hash: '0x2',
  chainId: '0x1',
  time: 1,
  txParams: { to: '0x1' },
} as unknown as TransactionMeta;

const createRemoteTransactionSourceMock = (
  remoteTransactions: TransactionMeta[],
  {
    isSupportedNetwork,
    error,
  }: {
    isSupportedNetwork?: boolean;
    error?: boolean;
    noGetLastBlockVariations?: boolean;
  } = {},
): RemoteTransactionSource => ({
  isChainsSupported: jest.fn(() => isSupportedNetwork ?? true),
  fetchTransactions: jest.fn(() =>
    error
      ? Promise.reject(new Error('Test Error'))
      : Promise.resolve(remoteTransactions),
  ),
});

async function emitBlockTrackerLatestEvent(
  helper: IncomingTransactionHelper,
  { start, error }: { start?: boolean; error?: boolean } = {},
) {
  const transactionsListener = jest.fn();
  const blockNumberListener = jest.fn();

  if (error) {
    transactionsListener.mockImplementation(() => {
      throw new Error('Test Error');
    });
  }

  helper.hub.addListener('transactions', transactionsListener);
  helper.hub.addListener('updatedLastFetchedBlockNumbers', blockNumberListener);

  if (start !== false) {
    helper.start();
  }

  jest.runOnlyPendingTimers();

  await flushPromises();

  return {
    transactions: transactionsListener.mock.calls[0]?.[0],
    lastFetchedBlockNumbers:
      blockNumberListener.mock.calls[0]?.[0].lastFetchedBlockNumbers,
    transactionsListener,
    blockNumberListener,
  };
}

describe('IncomingTransactionHelper', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.clearAllTimers();
    jest.setSystemTime(1000 * 60 * 60 * 24 * 2);
  });

  describe('on block tracker latest event', () => {
    // eslint-disable-next-line jest/expect-expect
    it('handles errors', async () => {
      const helper = new IncomingTransactionHelper({
        ...CONTROLLER_ARGS_MOCK,
        remoteTransactionSource: createRemoteTransactionSourceMock([
          TRANSACTION_MOCK_2,
        ]),
      });

      await emitBlockTrackerLatestEvent(helper, { error: true });
    });

    describe('fetches remote transactions', () => {
      it('using remote transaction source', async () => {
        const remoteTransactionSource = createRemoteTransactionSourceMock([]);

        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          remoteTransactionSource,
        });

        await emitBlockTrackerLatestEvent(helper);

        expect(remoteTransactionSource.fetchTransactions).toHaveBeenCalledTimes(
          1,
        );

        expect(remoteTransactionSource.fetchTransactions).toHaveBeenCalledWith({
          address: ADDRESS_MOCK,
          chainIds: [CHAIN_ID_MOCK],
          startTimestampByChainId: expect.any(Object),
          limit: CONTROLLER_ARGS_MOCK.transactionLimit,
        });
      });

      it('using 2 days ago as start timestamp if no state', async () => {
        const remoteTransactionSource = createRemoteTransactionSourceMock([]);

        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          remoteTransactionSource,
          queryEntireHistory: false,
        });

        await emitBlockTrackerLatestEvent(helper);

        expect(remoteTransactionSource.fetchTransactions).toHaveBeenCalledTimes(
          1,
        );

        expect(remoteTransactionSource.fetchTransactions).toHaveBeenCalledWith(
          expect.objectContaining({
            startTimestampByChainId: { [CHAIN_ID_MOCK]: 1000 * 30 },
          }),
        );
      });

      it('using last timestamp from state plus one', async () => {
        const remoteTransactionSource = createRemoteTransactionSourceMock([]);

        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          remoteTransactionSource,
          getLastFetchedBlockNumbers: () => ({
            [`${CHAIN_ID_MOCK}#${ADDRESS_MOCK}`]: FROM_BLOCK_DECIMAL_MOCK,
          }),
        });

        await emitBlockTrackerLatestEvent(helper);

        expect(remoteTransactionSource.fetchTransactions).toHaveBeenCalledTimes(
          1,
        );

        expect(remoteTransactionSource.fetchTransactions).toHaveBeenCalledWith(
          expect.objectContaining({
            startTimestampByChainId: {
              [CHAIN_ID_MOCK]: FROM_BLOCK_DECIMAL_MOCK + 1,
            },
          }),
        );
      });
    });

    describe('emits transactions event', () => {
      it('if new transaction fetched', async () => {
        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          remoteTransactionSource: createRemoteTransactionSourceMock([
            TRANSACTION_MOCK_2,
          ]),
        });

        const { transactions } = await emitBlockTrackerLatestEvent(helper);

        expect(transactions).toStrictEqual({
          added: [TRANSACTION_MOCK_2],
          updated: [],
        });
      });

      it('if new outgoing transaction fetched and update transactions enabled', async () => {
        const outgoingTransaction = {
          ...TRANSACTION_MOCK_2,
          txParams: {
            ...TRANSACTION_MOCK_2.txParams,
            from: '0x1',
            to: '0x2',
          },
        };

        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          remoteTransactionSource: createRemoteTransactionSourceMock([
            outgoingTransaction,
          ]),
          updateTransactions: true,
        });

        const { transactions } = await emitBlockTrackerLatestEvent(helper);

        expect(transactions).toStrictEqual({
          added: [outgoingTransaction],
          updated: [],
        });
      });

      it('sorted by time in ascending order', async () => {
        const firstTransaction = { ...TRANSACTION_MOCK, time: 5 };
        const secondTransaction = { ...TRANSACTION_MOCK, time: 6 };
        const thirdTransaction = { ...TRANSACTION_MOCK, time: 7 };

        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          remoteTransactionSource: createRemoteTransactionSourceMock([
            firstTransaction,
            thirdTransaction,
            secondTransaction,
          ]),
        });

        const { transactions } = await emitBlockTrackerLatestEvent(helper);

        expect(transactions).toStrictEqual({
          added: [firstTransaction, secondTransaction, thirdTransaction],
          updated: [],
        });
      });

      it('does not if disabled', async () => {
        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          remoteTransactionSource: createRemoteTransactionSourceMock([
            TRANSACTION_MOCK,
          ]),
          isEnabled: jest
            .fn()
            .mockReturnValueOnce(true)
            .mockReturnValueOnce(false),
        });

        const { transactionsListener } = await emitBlockTrackerLatestEvent(
          helper,
        );

        expect(transactionsListener).not.toHaveBeenCalled();
      });

      it('does not if current network is not supported by remote transaction source', async () => {
        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          remoteTransactionSource: createRemoteTransactionSourceMock(
            [TRANSACTION_MOCK],
            { isSupportedNetwork: false },
          ),
        });

        const { transactionsListener } = await emitBlockTrackerLatestEvent(
          helper,
        );

        expect(transactionsListener).not.toHaveBeenCalled();
      });

      it('does not if no remote transactions', async () => {
        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          remoteTransactionSource: createRemoteTransactionSourceMock([]),
        });

        const { transactionsListener } = await emitBlockTrackerLatestEvent(
          helper,
        );

        expect(transactionsListener).not.toHaveBeenCalled();
      });

      it('does not if error fetching transactions', async () => {
        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          remoteTransactionSource: createRemoteTransactionSourceMock(
            [TRANSACTION_MOCK],
            { error: true },
          ),
        });

        const { transactionsListener } = await emitBlockTrackerLatestEvent(
          helper,
        );

        expect(transactionsListener).not.toHaveBeenCalled();
      });

      it('does not if not started', async () => {
        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          remoteTransactionSource: createRemoteTransactionSourceMock([
            TRANSACTION_MOCK,
          ]),
        });

        const { transactionsListener } = await emitBlockTrackerLatestEvent(
          helper,
          { start: false },
        );

        expect(transactionsListener).not.toHaveBeenCalled();
      });
    });

    describe('emits updatedLastFetchedBlockNumbers event', () => {
      it('if fetched transaction has higher timestamp', async () => {
        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          remoteTransactionSource: createRemoteTransactionSourceMock([
            TRANSACTION_MOCK_2,
          ]),
        });

        const { lastFetchedBlockNumbers } = await emitBlockTrackerLatestEvent(
          helper,
        );

        expect(lastFetchedBlockNumbers).toStrictEqual({
          [`${CHAIN_ID_MOCK}#${ADDRESS_MOCK}`]: TRANSACTION_MOCK_2.time,
        });
      });

      it('does not if no fetched transactions', async () => {
        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          remoteTransactionSource: createRemoteTransactionSourceMock([]),
        });

        const { blockNumberListener } = await emitBlockTrackerLatestEvent(
          helper,
        );

        expect(blockNumberListener).not.toHaveBeenCalled();
      });

      it('does not if fetched transaction has same block number', async () => {
        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          remoteTransactionSource: createRemoteTransactionSourceMock([
            TRANSACTION_MOCK_2,
          ]),
          getLastFetchedBlockNumbers: () => ({
            [`${CHAIN_ID_MOCK}#${ADDRESS_MOCK}`]: TRANSACTION_MOCK_2.time,
          }),
        });

        const { blockNumberListener } = await emitBlockTrackerLatestEvent(
          helper,
        );

        expect(blockNumberListener).not.toHaveBeenCalled();
      });

      it('does not if current account is undefined', async () => {
        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          remoteTransactionSource: createRemoteTransactionSourceMock([
            TRANSACTION_MOCK_2,
          ]),
          // @ts-expect-error testing undefined
          getCurrentAccount: () => undefined,
        });

        const { blockNumberListener } = await emitBlockTrackerLatestEvent(
          helper,
        );

        expect(blockNumberListener).not.toHaveBeenCalled();
      });
    });
  });

  describe('start', () => {
    it('adds listener to block tracker', async () => {
      const helper = new IncomingTransactionHelper({
        ...CONTROLLER_ARGS_MOCK,
        remoteTransactionSource: createRemoteTransactionSourceMock([]),
      });

      helper.start();

      expect(jest.getTimerCount()).toBe(1);
    });

    it('does nothing if already started', async () => {
      const helper = new IncomingTransactionHelper({
        ...CONTROLLER_ARGS_MOCK,
        remoteTransactionSource: createRemoteTransactionSourceMock([]),
      });

      helper.start();
      helper.start();

      expect(jest.getTimerCount()).toBe(1);
    });

    it('does nothing if disabled', async () => {
      const helper = new IncomingTransactionHelper({
        ...CONTROLLER_ARGS_MOCK,
        isEnabled: () => false,
        remoteTransactionSource: createRemoteTransactionSourceMock([]),
      });

      helper.start();

      expect(jest.getTimerCount()).toBe(0);
    });

    it('does nothing if network not supported by remote transaction source', async () => {
      const helper = new IncomingTransactionHelper({
        ...CONTROLLER_ARGS_MOCK,
        remoteTransactionSource: createRemoteTransactionSourceMock([], {
          isSupportedNetwork: false,
        }),
      });

      helper.start();

      expect(jest.getTimerCount()).toBe(0);
    });
  });

  describe('stop', () => {
    it('removes timeout', async () => {
      const helper = new IncomingTransactionHelper({
        ...CONTROLLER_ARGS_MOCK,
        remoteTransactionSource: createRemoteTransactionSourceMock([]),
      });

      helper.start();
      helper.stop();

      expect(jest.getTimerCount()).toBe(0);
    });
  });

  describe('update', () => {
    it('emits transactions event', async () => {
      const listener = jest.fn();

      const helper = new IncomingTransactionHelper({
        ...CONTROLLER_ARGS_MOCK,
        remoteTransactionSource: createRemoteTransactionSourceMock([
          TRANSACTION_MOCK_2,
        ]),
      });

      helper.hub.on('transactions', listener);

      await helper.update();

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({
        added: [TRANSACTION_MOCK_2],
        updated: [],
      });
    });
  });
});
