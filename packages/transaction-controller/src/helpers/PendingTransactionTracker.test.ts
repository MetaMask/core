/* eslint-disable jsdoc/require-jsdoc */

import { query } from '@metamask/controller-utils';
import type { BlockTracker } from '@metamask/network-controller';
import NonceTracker from 'nonce-tracker';

import { TransactionStatus } from '../types';
import { PendingTransactionTracker } from './PendingTransactionTracker';

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

jest.mock('nonce-tracker', () => ({
  getGlobalLock: jest.fn().mockResolvedValue({
    releaseLock: () => Promise.resolve(),
  }),
  getNonceLock: jest.fn(),
}));

function createBlockTrackerMock(): jest.Mocked<BlockTracker> {
  return {
    addListener: jest.fn(),
  } as any;
}

describe('PendingTransactionTracker', () => {
  const queryMock = jest.mocked(query);
  const nonceTrackerMock = jest.mocked(NonceTracker);
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
      nonceTracker: nonceTrackerMock,
    };
  });

  describe('with submitted transaction', () => {
    it('updates transaction status to confirmed if transaction on chain with block number', async () => {
      const transactionsListener = jest.fn();
      const confirmedListener = jest.fn();

      const tracker = new PendingTransactionTracker({
        ...options,
        getTransactions: () => [{ ...TRANSACTION_SUBMITTED_MOCK }],
      });

      tracker.hub.addListener('transactions', transactionsListener);
      tracker.hub.addListener(`transaction-confirmed`, confirmedListener);
      tracker.start();

      queryMock.mockResolvedValueOnce({ blockNumber: BLOCK_NUMBER_MOCK });

      await (blockTracker.addListener.mock.calls[0][1]() as any);

      expect(transactionsListener).toHaveBeenCalledTimes(1);
      expect(transactionsListener).toHaveBeenCalledWith([
        TRANSACTION_CONFIRMED_MOCK,
      ]);
    });
    it('updates transaction status to failed if transaction on chain with block number and a status of "0x0"', async () => {
      const transactionsListener = jest.fn();

      const tracker = new PendingTransactionTracker({
        ...options,
        getTransactions: () => [{ ...TRANSACTION_SUBMITTED_MOCK }],
      });

      tracker.hub.addListener('transactions', transactionsListener);
      tracker.start();

      queryMock
        .mockResolvedValueOnce({ blockNumber: BLOCK_NUMBER_MOCK })
        .mockResolvedValueOnce({ status: 0 });

      await (blockTracker.addListener.mock.calls[0][1]() as any);

      expect(failTransaction).toHaveBeenCalledTimes(1);
      expect(failTransaction).toHaveBeenCalledWith(
        TRANSACTION_SUBMITTED_MOCK,
        new Error('Transaction failed. The transaction was reversed'),
      );
    });

    it('fails transaction if no transaction on chain and receipt has failed status', async () => {
      const tracker = new PendingTransactionTracker({
        ...options,
        getTransactions: () => [{ ...TRANSACTION_SUBMITTED_MOCK }],
      });

      tracker.start();

      queryMock
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ status: 0 });

      await (blockTracker.addListener.mock.calls[0][1]() as any);

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
      });

      tracker.hub.addListener('transactions', transactionsListener);
      tracker.start();

      await (blockTracker.addListener.mock.calls[0][1]() as any);

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
      });

      tracker.hub.addListener('transactions', transactionsListener);
      tracker.start();

      queryMock
        .mockResolvedValueOnce(RECEIPT_MOCK)
        .mockResolvedValueOnce(BLOCK_MOCK);

      await (blockTracker.addListener.mock.calls[0][1]() as any);

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
      });

      tracker.hub.addListener('transactions', transactionsListener);
      tracker.start();

      queryMock
        .mockResolvedValueOnce(RECEIPT_MOCK)
        .mockResolvedValueOnce(undefined);

      await (blockTracker.addListener.mock.calls[0][1]() as any);

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
      });

      tracker.hub.addListener('transactions', transactionsListener);
      tracker.start();

      queryMock
        .mockResolvedValueOnce({ ...RECEIPT_MOCK, status: 0 })
        .mockResolvedValueOnce(BLOCK_MOCK);

      await (blockTracker.addListener.mock.calls[0][1]() as any);

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
      });

      tracker.hub.addListener('transactions', transactionsListener);
      tracker.start();

      await (blockTracker.addListener.mock.calls[0][1]() as any);

      expect(failTransaction).toHaveBeenCalledTimes(0);
      expect(transactionsListener).toHaveBeenCalledTimes(0);
    });

    it('does not throw when query fails while checking the status of a submitted transaction', async () => {
      const transactionsListener = jest.fn();
      queryMock.mockImplementation(() => {
        throw new Error('Mocked query error');
      });

      const tracker = new PendingTransactionTracker({
        ...options,
        getTransactions: () => [{ ...TRANSACTION_CONFIRMED_MOCK }],
      });

      tracker.hub.addListener('transactions', transactionsListener);
      tracker.start();

      await (blockTracker.addListener.mock.calls[0][1]() as any);

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
    });

    tracker.hub.addListener('transactions', transactionsListener);
    tracker.start();

    await (blockTracker.addListener.mock.calls[0][1]() as any);

    expect(failTransaction).toHaveBeenCalledTimes(0);
    expect(transactionsListener).toHaveBeenCalledTimes(0);
  });
});
