/* eslint-disable jest/prefer-spy-on */
/* eslint-disable jsdoc/require-jsdoc */

import type { BlockTracker } from '@metamask/network-controller';

import {
  TransactionStatus,
  type RemoteTransactionSource,
  type TransactionMeta,
} from '../types';
import { IncomingTransactionHelper } from './IncomingTransactionHelper';

jest.mock('@metamask/controller-utils', () => ({
  ...jest.requireActual('@metamask/controller-utils'),
  isSmartContractCode: jest.fn(),
  query: () => Promise.resolve({}),
}));

console.error = jest.fn();

const CHAIN_ID_MOCK = '0x1' as const;
const ADDRESS_MOCK = '0x1';
const FROM_BLOCK_HEX_MOCK = '0x20';
const FROM_BLOCK_DECIMAL_MOCK = 32;
const LAST_BLOCK_VARIATION_MOCK = 'test-variation';

const BLOCK_TRACKER_MOCK = {
  addListener: jest.fn(),
  removeListener: jest.fn(),
  getLatestBlock: jest.fn(() => FROM_BLOCK_HEX_MOCK),
} as unknown as jest.Mocked<BlockTracker>;

const CONTROLLER_ARGS_MOCK = {
  getBlockTracker: () => BLOCK_TRACKER_MOCK,
  getCurrentAccount: () => ADDRESS_MOCK,
  getLastFetchedBlockNumbers: () => ({}),
  getChainId: () => CHAIN_ID_MOCK,
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
  blockNumber: '234',
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
    noGetLastBlockVariations,
  }: {
    isSupportedNetwork?: boolean;
    error?: boolean;
    noGetLastBlockVariations?: boolean;
  } = {},
): RemoteTransactionSource => ({
  isSupportedNetwork: jest.fn(() => isSupportedNetwork ?? true),
  getLastBlockVariations: noGetLastBlockVariations
    ? undefined
    : jest.fn(() => [LAST_BLOCK_VARIATION_MOCK]),
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

  await BLOCK_TRACKER_MOCK.addListener.mock.calls[0]?.[1]?.(
    FROM_BLOCK_HEX_MOCK,
  );

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
          currentChainId: CHAIN_ID_MOCK,
          fromBlock: undefined,
          limit: CONTROLLER_ARGS_MOCK.transactionLimit,
        });
      });

      it('using from block as latest block minus ten if no last fetched data and not querying entire history', async () => {
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
            fromBlock: FROM_BLOCK_DECIMAL_MOCK - 10,
          }),
        );
      });

      it('using from block as undefined if querying entire history', async () => {
        const remoteTransactionSource = createRemoteTransactionSourceMock([]);

        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          remoteTransactionSource,
        });

        await emitBlockTrackerLatestEvent(helper);

        expect(remoteTransactionSource.fetchTransactions).toHaveBeenCalledTimes(
          1,
        );

        expect(remoteTransactionSource.fetchTransactions).toHaveBeenCalledWith(
          expect.objectContaining({
            fromBlock: undefined,
          }),
        );
      });

      it('using from block as last fetched value plus one', async () => {
        const remoteTransactionSource = createRemoteTransactionSourceMock([]);

        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          remoteTransactionSource,
          getLastFetchedBlockNumbers: () => ({
            [`${CHAIN_ID_MOCK}#${ADDRESS_MOCK}#${LAST_BLOCK_VARIATION_MOCK}`]:
              FROM_BLOCK_DECIMAL_MOCK,
          }),
        });

        await emitBlockTrackerLatestEvent(helper);

        expect(remoteTransactionSource.fetchTransactions).toHaveBeenCalledTimes(
          1,
        );

        expect(remoteTransactionSource.fetchTransactions).toHaveBeenCalledWith(
          expect.objectContaining({
            fromBlock: FROM_BLOCK_DECIMAL_MOCK + 1,
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

      it('if existing transaction fetched with different status and update transactions enabled', async () => {
        const updatedTransaction = {
          ...TRANSACTION_MOCK,
          status: TransactionStatus.confirmed,
        } as TransactionMeta;

        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          remoteTransactionSource: createRemoteTransactionSourceMock([
            updatedTransaction,
          ]),
          getLocalTransactions: () => [TRANSACTION_MOCK],
          updateTransactions: true,
        });

        const { transactions } = await emitBlockTrackerLatestEvent(helper);

        expect(transactions).toStrictEqual({
          added: [],
          updated: [updatedTransaction],
        });
      });

      it('if existing transaction fetched with different gas used and update transactions enabled', async () => {
        const updatedTransaction = {
          ...TRANSACTION_MOCK,
          txParams: {
            ...TRANSACTION_MOCK.txParams,
            gasUsed: '0x2',
          },
        } as TransactionMeta;

        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          remoteTransactionSource: createRemoteTransactionSourceMock([
            updatedTransaction,
          ]),
          getLocalTransactions: () => [TRANSACTION_MOCK],
          updateTransactions: true,
        });

        const { transactions } = await emitBlockTrackerLatestEvent(helper);

        expect(transactions).toStrictEqual({
          added: [],
          updated: [updatedTransaction],
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

      it('does not if identical transaction fetched and update transactions enabled', async () => {
        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          remoteTransactionSource: createRemoteTransactionSourceMock([
            TRANSACTION_MOCK,
          ]),
          getLocalTransactions: () => [TRANSACTION_MOCK],
          updateTransactions: true,
        });

        const { transactionsListener } = await emitBlockTrackerLatestEvent(
          helper,
        );

        expect(transactionsListener).not.toHaveBeenCalled();
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

      it('does not if update transactions disabled and no incoming transactions', async () => {
        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          remoteTransactionSource: createRemoteTransactionSourceMock([
            {
              ...TRANSACTION_MOCK,
              txParams: { to: '0x2' },
            } as TransactionMeta,
            {
              ...TRANSACTION_MOCK,
              txParams: { to: undefined },
            } as TransactionMeta,
          ]),
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
      it('if fetched transaction has higher block number', async () => {
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
          [`${CHAIN_ID_MOCK}#${ADDRESS_MOCK}#${LAST_BLOCK_VARIATION_MOCK}`]:
            parseInt(TRANSACTION_MOCK_2.blockNumber as string, 10),
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

      it('does not if no block number on fetched transaction', async () => {
        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          remoteTransactionSource: createRemoteTransactionSourceMock([
            { ...TRANSACTION_MOCK_2, blockNumber: undefined },
          ]),
        });

        const { blockNumberListener } = await emitBlockTrackerLatestEvent(
          helper,
        );

        expect(blockNumberListener).not.toHaveBeenCalled();
      });

      it('does not if fetch transaction not to current account', async () => {
        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          remoteTransactionSource: createRemoteTransactionSourceMock([
            {
              ...TRANSACTION_MOCK_2,
              txParams: { to: '0x2' },
            } as TransactionMeta,
          ]),
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
            [`${CHAIN_ID_MOCK}#${ADDRESS_MOCK}#${LAST_BLOCK_VARIATION_MOCK}`]:
              parseInt(TRANSACTION_MOCK_2.blockNumber as string, 10),
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
          getCurrentAccount: () => undefined as unknown as string,
        });

        const { blockNumberListener } = await emitBlockTrackerLatestEvent(
          helper,
        );

        expect(blockNumberListener).not.toHaveBeenCalled();
      });

      it('using no additional last block keys if remote source does not implement method', async () => {
        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          remoteTransactionSource: createRemoteTransactionSourceMock(
            [TRANSACTION_MOCK_2],
            { noGetLastBlockVariations: true },
          ),
        });

        const { lastFetchedBlockNumbers } = await emitBlockTrackerLatestEvent(
          helper,
        );

        expect(lastFetchedBlockNumbers).toStrictEqual({
          [`${CHAIN_ID_MOCK}#${ADDRESS_MOCK}`]: parseInt(
            TRANSACTION_MOCK_2.blockNumber as string,
            10,
          ),
        });
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

      expect(
        CONTROLLER_ARGS_MOCK.getBlockTracker().addListener,
      ).toHaveBeenCalledTimes(1);
    });

    it('does nothing if already started', async () => {
      const helper = new IncomingTransactionHelper({
        ...CONTROLLER_ARGS_MOCK,
        remoteTransactionSource: createRemoteTransactionSourceMock([]),
      });

      helper.start();
      helper.start();

      expect(
        CONTROLLER_ARGS_MOCK.getBlockTracker().addListener,
      ).toHaveBeenCalledTimes(1);
    });

    it('does nothing if disabled', async () => {
      const helper = new IncomingTransactionHelper({
        ...CONTROLLER_ARGS_MOCK,
        isEnabled: () => false,
        remoteTransactionSource: createRemoteTransactionSourceMock([]),
      });

      helper.start();

      expect(
        CONTROLLER_ARGS_MOCK.getBlockTracker().addListener,
      ).not.toHaveBeenCalled();
    });

    it('does nothing if network not supported by remote transaction source', async () => {
      const helper = new IncomingTransactionHelper({
        ...CONTROLLER_ARGS_MOCK,
        remoteTransactionSource: createRemoteTransactionSourceMock([], {
          isSupportedNetwork: false,
        }),
      });

      helper.start();

      expect(
        CONTROLLER_ARGS_MOCK.getBlockTracker().addListener,
      ).not.toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('removes listener from block tracker', async () => {
      const helper = new IncomingTransactionHelper({
        ...CONTROLLER_ARGS_MOCK,
        remoteTransactionSource: createRemoteTransactionSourceMock([]),
      });

      helper.start();
      helper.stop();

      expect(
        CONTROLLER_ARGS_MOCK.getBlockTracker().removeListener,
      ).toHaveBeenCalledTimes(1);
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
