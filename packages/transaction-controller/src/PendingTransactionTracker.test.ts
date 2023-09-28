/* eslint-disable jsdoc/require-jsdoc */

import { query } from '@metamask/controller-utils';
import type { BlockTracker } from '@metamask/network-controller';

import { PendingTransactionTracker } from './PendingTransactionTracker';
import { TransactionStatus } from './types';

const ID_MOCK = 'testId';
const CHAIN_ID_MOCK = '0x1';
const BLOCK_NUMBER_MOCK = '0x1';

const TRANSACTION_SUBMITTED_MOCK = {
  id: ID_MOCK,
  chainId: CHAIN_ID_MOCK,
  status: TransactionStatus.submitted,
  txParams: {},
};

const TRANSACTION_CONFIRMED_MOCK = {
  ...TRANSACTION_SUBMITTED_MOCK,
  status: TransactionStatus.confirmed,
};

const RECEIPT_MOCK = {
  gasUsed: '0x123',
};

const BLOCK_MOCK = {
  baseFeePerGas: '0x456',
  timestamp: 123456,
};

jest.mock('@metamask/controller-utils', () => ({
  query: jest.fn(),
  safelyExecute: (fn: () => any) => fn(),
}));

jest.mock('@metamask/utils', () => ({
  createProjectLogger: () => ({
    log: jest.fn(),
  }),
  createModuleLogger: () => ({
    log: jest.fn(),
  }),
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

  beforeEach(() => {
    blockTracker = createBlockTrackerMock();
    failTransaction = jest.fn();

    options = {
      blockTracker,
      failTransaction,
      getChainId: () => CHAIN_ID_MOCK,
      getEthQuery: () => ({}),
      getTransactions: () => [],
    };
  });

  describe('with submitted transaction', () => {
    it('updates transaction status to confirmed if transaction on chain with block number', async () => {
      const transactionsListener = jest.fn();
      const confirmedListener = jest.fn();

      const tracker = new PendingTransactionTracker({
        ...options,
        getTransactions: () => [{ ...TRANSACTION_SUBMITTED_MOCK }],
      } as any);

      tracker.hub.on('transactions', transactionsListener);
      tracker.hub.on(`${ID_MOCK}:confirmed`, confirmedListener);
      tracker.start();

      queryMock.mockResolvedValueOnce({ blockNumber: BLOCK_NUMBER_MOCK });

      await (blockTracker.on.mock.calls[0][1]() as any);

      expect(transactionsListener).toHaveBeenCalledTimes(1);
      expect(transactionsListener).toHaveBeenCalledWith([
        TRANSACTION_CONFIRMED_MOCK,
      ]);

      expect(confirmedListener).toHaveBeenCalledTimes(1);
      expect(confirmedListener).toHaveBeenCalledWith(
        TRANSACTION_CONFIRMED_MOCK,
      );
    });

    it('fails transaction if no transaction on chain and receipt has failed status', async () => {
      const tracker = new PendingTransactionTracker({
        ...options,
        getTransactions: () => [{ ...TRANSACTION_SUBMITTED_MOCK }],
      } as any);

      tracker.start();

      queryMock
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ status: 0 });

      await (blockTracker.on.mock.calls[0][1]() as any);

      expect(failTransaction).toHaveBeenCalledTimes(1);
      expect(failTransaction).toHaveBeenCalledWith(
        TRANSACTION_SUBMITTED_MOCK,
        new Error(
          'Transaction failed. The transaction was dropped or replaced by a new one',
        ),
      );
    });

    it('does nothing if no transaction on chain and no receipt', async () => {
      const transactionsListener = jest.fn();

      const tracker = new PendingTransactionTracker({
        ...options,
        getTransactions: () => [{ ...TRANSACTION_SUBMITTED_MOCK }],
      } as any);

      tracker.hub.on('transactions', transactionsListener);
      tracker.start();

      await (blockTracker.on.mock.calls[0][1]() as any);

      expect(failTransaction).toHaveBeenCalledTimes(0);
      expect(transactionsListener).toHaveBeenCalledTimes(0);
    });
  });

  describe('with confirmed transaction', () => {
    it('updates transaction fields if receipt', async () => {
      const transactionsListener = jest.fn();

      const tracker = new PendingTransactionTracker({
        ...options,
        getTransactions: () => [{ ...TRANSACTION_CONFIRMED_MOCK }],
      } as any);

      tracker.hub.on('transactions', transactionsListener);
      tracker.start();

      queryMock
        .mockResolvedValueOnce(RECEIPT_MOCK)
        .mockResolvedValueOnce(BLOCK_MOCK);

      await (blockTracker.on.mock.calls[0][1]() as any);

      expect(transactionsListener).toHaveBeenCalledTimes(1);
      expect(transactionsListener).toHaveBeenCalledWith([
        {
          ...TRANSACTION_CONFIRMED_MOCK,
          baseFeePerGas: BLOCK_MOCK.baseFeePerGas,
          blockTimestamp: BLOCK_MOCK.timestamp,
          txParams: {
            gasUsed: RECEIPT_MOCK.gasUsed,
          },
          txReceipt: RECEIPT_MOCK,
          verifiedOnBlockchain: true,
        },
      ]);
    });

    it('updates transaction fields if receipt but no block', async () => {
      const transactionsListener = jest.fn();

      const tracker = new PendingTransactionTracker({
        ...options,
        getTransactions: () => [{ ...TRANSACTION_CONFIRMED_MOCK }],
      } as any);

      tracker.hub.on('transactions', transactionsListener);
      tracker.start();

      queryMock
        .mockResolvedValueOnce(RECEIPT_MOCK)
        .mockResolvedValueOnce(undefined);

      await (blockTracker.on.mock.calls[0][1]() as any);

      expect(transactionsListener).toHaveBeenCalledTimes(1);
      expect(transactionsListener).toHaveBeenCalledWith([
        {
          ...TRANSACTION_CONFIRMED_MOCK,
          baseFeePerGas: undefined,
          blockTimestamp: undefined,
          txParams: {
            gasUsed: RECEIPT_MOCK.gasUsed,
          },
          txReceipt: RECEIPT_MOCK,
          verifiedOnBlockchain: true,
        },
      ]);
    });

    it('fails transaction if receipt has failed status', async () => {
      const transactionsListener = jest.fn();

      const tracker = new PendingTransactionTracker({
        ...options,
        getTransactions: () => [{ ...TRANSACTION_CONFIRMED_MOCK }],
      } as any);

      tracker.hub.on('transactions', transactionsListener);
      tracker.start();

      queryMock
        .mockResolvedValueOnce({ ...RECEIPT_MOCK, status: 0 })
        .mockResolvedValueOnce(BLOCK_MOCK);

      await (blockTracker.on.mock.calls[0][1]() as any);

      expect(failTransaction).toHaveBeenCalledTimes(1);
      expect(failTransaction).toHaveBeenCalledWith(
        {
          ...TRANSACTION_CONFIRMED_MOCK,
          baseFeePerGas: BLOCK_MOCK.baseFeePerGas,
          blockTimestamp: BLOCK_MOCK.timestamp,
          txParams: {
            gasUsed: RECEIPT_MOCK.gasUsed,
          },
          txReceipt: { ...RECEIPT_MOCK, status: 0 },
          verifiedOnBlockchain: true,
        },
        new Error('Transaction failed. The transaction was reversed'),
      );
    });

    it('does nothing if no receipt', async () => {
      const transactionsListener = jest.fn();

      const tracker = new PendingTransactionTracker({
        ...options,
        getTransactions: () => [{ ...TRANSACTION_CONFIRMED_MOCK }],
      } as any);

      tracker.hub.on('transactions', transactionsListener);
      tracker.start();

      await (blockTracker.on.mock.calls[0][1]() as any);

      expect(failTransaction).toHaveBeenCalledTimes(0);
      expect(transactionsListener).toHaveBeenCalledTimes(0);
    });
  });

  it('does nothing if status not submitted or confirmed', async () => {
    const transactionsListener = jest.fn();

    const tracker = new PendingTransactionTracker({
      ...options,
      getTransactions: () => [
        { ...TRANSACTION_CONFIRMED_MOCK, status: TransactionStatus.failed },
      ],
    } as any);

    tracker.hub.on('transactions', transactionsListener);
    tracker.start();

    await (blockTracker.on.mock.calls[0][1]() as any);

    expect(failTransaction).toHaveBeenCalledTimes(0);
    expect(transactionsListener).toHaveBeenCalledTimes(0);
  });
});
