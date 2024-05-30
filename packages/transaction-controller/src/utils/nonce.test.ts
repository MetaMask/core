import type {
  NonceLock,
  Transaction as NonceTrackerTransaction,
} from '@metamask/nonce-tracker';

import type { TransactionMeta } from '../types';
import { TransactionStatus } from '../types';
import { getAndFormatTransactionsForNonceTracker, getNextNonce } from './nonce';

const TRANSACTION_META_MOCK: TransactionMeta = {
  chainId: '0x1',
  id: 'testId1',
  status: TransactionStatus.unapproved,
  time: 1,
  txParams: {
    from: '0x1',
  },
};

describe('nonce', () => {
  describe('getNextNonce', () => {
    it('returns custom nonce if provided', async () => {
      const transactionMeta = {
        ...TRANSACTION_META_MOCK,
        customNonceValue: '123',
      };

      const [nonce, releaseLock] = await getNextNonce(
        transactionMeta,
        jest.fn(),
      );

      expect(nonce).toBe('0x7b');
      expect(releaseLock).toBeUndefined();
    });

    it('returns existing nonce if provided and no custom nonce', async () => {
      const transactionMeta = {
        ...TRANSACTION_META_MOCK,
        txParams: {
          ...TRANSACTION_META_MOCK.txParams,
          nonce: '0x123',
        },
      };

      const [nonce, releaseLock] = await getNextNonce(
        transactionMeta,
        jest.fn(),
      );

      expect(nonce).toBe('0x123');
      expect(releaseLock).toBeUndefined();
    });

    it('returns next nonce from tracker if no custom nonce and no existing nonce', async () => {
      const transactionMeta = {
        ...TRANSACTION_META_MOCK,
        txParams: {
          ...TRANSACTION_META_MOCK.txParams,
        },
      };

      const releaseLock = jest.fn();

      const [nonce, resultReleaseLock] = await getNextNonce(
        transactionMeta,
        () =>
          Promise.resolve({
            nextNonce: 456,
            releaseLock,
          } as unknown as NonceLock),
      );

      expect(nonce).toBe('0x1c8');

      resultReleaseLock?.();

      expect(releaseLock).toHaveBeenCalledTimes(1);
    });
  });

  describe('getAndFormatTransactionsForNonceTracker', () => {
    it('returns formatted transactions filtered by chain, from, isTransfer, and status', () => {
      const fromAddress = '0x123';
      const inputTransactions: TransactionMeta[] = [
        {
          id: '1',
          chainId: '0x1',
          time: 123456,
          txParams: {
            from: fromAddress,
            gas: '0x100',
            value: '0x200',
            nonce: '0x1',
          },
          status: TransactionStatus.confirmed,
        },
        {
          id: '2',
          chainId: '0x1',
          time: 123457,
          txParams: {
            from: '0x124',
            gas: '0x101',
            value: '0x201',
            nonce: '0x2',
          },
          status: TransactionStatus.submitted,
        },
        {
          id: '3',
          chainId: '0x1',
          time: 123458,
          txParams: {
            from: fromAddress,
            gas: '0x102',
            value: '0x202',
            nonce: '0x3',
          },
          status: TransactionStatus.approved,
        },
        {
          id: '4',
          chainId: '0x2',
          time: 123459,
          txParams: {
            from: fromAddress,
            gas: '0x103',
            value: '0x203',
            nonce: '0x4',
          },
          status: TransactionStatus.confirmed,
        },
        {
          id: '5',
          chainId: '0x2',
          isTransfer: true,
          time: 123460,
          txParams: {
            from: fromAddress,
            gas: '0x104',
            value: '0x204',
            nonce: '0x5',
          },
          status: TransactionStatus.confirmed,
        },
      ];

      const expectedResult: NonceTrackerTransaction[] = [
        {
          status: TransactionStatus.confirmed,
          history: [{}],
          txParams: {
            from: fromAddress,
            gas: '0x103',
            value: '0x203',
            nonce: '0x4',
          },
        },
      ];

      const result = getAndFormatTransactionsForNonceTracker(
        '0x2',
        fromAddress,
        TransactionStatus.confirmed,
        inputTransactions,
      );

      expect(result).toStrictEqual(expectedResult);
    });
  });
});
