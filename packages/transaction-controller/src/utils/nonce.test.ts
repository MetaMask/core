import type {
  NonceLock,
  Transaction as NonceTrackerTransaction,
} from '@metamask/nonce-tracker';
import type { Hex } from '@metamask/utils';

import type { Authorization, TransactionMeta } from '../types.js';
import { TransactionStatus } from '../types.js';
import {
  getAndFormatTransactionsForNonceTracker,
  getNextNonce,
} from './nonce.js';

const TRANSACTION_META_MOCK: TransactionMeta = {
  chainId: '0x1',
  id: 'testId1',
  networkClientId: 'testNetworkClientId',
  status: TransactionStatus.unapproved,
  time: 1,
  txParams: {
    from: '0x1',
  },
};

// Signed by 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (Hardhat account #0)
const EOA_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const EOA_AUTHORIZATION: Authorization = {
  address: '0xcccccccccccccccccccccccccccccccccccccccc',
  chainId: '0x1',
  nonce: '0x6',
  r: '0xe2582357434f268c18dd7e2920dd3a911bfc6fc5e498bf7eb33fa0f484bd1488',
  s: '0x6300c28d38a634904af92933b5b31433536a7cee8a505945c13ade9f3a1a5427',
  yParity: '0x0',
};

// Signed by 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 (Hardhat account #1)
const MONEY_ACCOUNT_ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const MONEY_ACCOUNT_AUTHORIZATION: Authorization = {
  address: '0xdddddddddddddddddddddddddddddddddddddddd',
  chainId: '0x1',
  nonce: '0x14',
  r: '0x5d89be0904cbf8acd68969ac2a9974f8d959418b9386a65bf3477f0a57f07e01',
  s: '0x1ad94d72ad05346cfc97f71b35d0d1b569ccc8fd04f3001fc389f0f2d1348cce',
  yParity: '0x1',
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

    it('returns undefined if transaction is signed externally', async () => {
      const transactionMeta = {
        ...TRANSACTION_META_MOCK,
        isExternalSign: true,
      };

      const [nonce, releaseLock] = await getNextNonce(
        transactionMeta,
        jest.fn(),
      );

      expect(nonce).toBeUndefined();
      expect(releaseLock).toBeUndefined();
    });
  });

  describe('getAndFormatTransactionsForNonceTracker', () => {
    it('returns formatted transactions filtered by chain, from, isTransfer, and status', () => {
      const fromAddress = '0x123';
      const inputTransactions: TransactionMeta[] = [
        {
          id: '1',
          chainId: '0x1',
          networkClientId: 'testNetworkClientId',
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
          networkClientId: 'testNetworkClientId',
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
          networkClientId: 'testNetworkClientId',
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
          networkClientId: 'testNetworkClientId',
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
          networkClientId: 'testNetworkClientId',
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
        {
          id: '5',
          chainId: '0x2',
          networkClientId: 'testNetworkClientId',
          isUserOperation: true,
          time: 123460,
          txParams: {
            from: fromAddress,
            gas: '0x104',
            value: '0x204',
            nonce: '0x5',
          },
          status: TransactionStatus.confirmed,
        },
        {
          id: '5',
          chainId: '0x2',
          networkClientId: 'testNetworkClientId',
          time: 123460,
          txParams: {
            from: fromAddress,
            gas: '0x104',
            value: '0x204',
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
        [TransactionStatus.confirmed],
        inputTransactions,
      );

      expect(result).toStrictEqual(expectedResult);
    });

    it('includes unsigned authorization nonces attributed to the transaction sender', () => {
      const inputTransactions: TransactionMeta[] = [
        {
          id: '1',
          chainId: '0x1',
          networkClientId: 'testNetworkClientId',
          time: 123456,
          txParams: {
            from: EOA_ADDRESS,
            gas: '0x100',
            value: '0x200',
            nonce: '0x1',
            authorizationList: [
              {
                address: '0xabc' as Hex,
                nonce: '0x2',
              },
              {
                address: '0xdef' as Hex,
                nonce: '0x3',
              },
            ],
          },
          status: TransactionStatus.confirmed,
        },
      ];

      const result = getAndFormatTransactionsForNonceTracker(
        '0x1',
        EOA_ADDRESS,
        [TransactionStatus.confirmed],
        inputTransactions,
      );

      expect(result).toHaveLength(3);
      expect(result.map((tx) => tx.txParams.nonce)).toStrictEqual([
        '0x1',
        '0x2',
        '0x3',
      ]);
      expect(result.map((tx) => tx.txParams.from)).toStrictEqual([
        EOA_ADDRESS,
        EOA_ADDRESS,
        EOA_ADDRESS,
      ]);
    });

    it('attributes mixed-authority authorization nonces to recovered signers only', () => {
      const inputTransactions: TransactionMeta[] = [
        {
          id: '1',
          chainId: '0x1',
          networkClientId: 'testNetworkClientId',
          time: 123456,
          txParams: {
            from: EOA_ADDRESS,
            gas: '0x100',
            value: '0x200',
            // EOA tx nonce 5, EOA auth nonce 6, Money Account auth nonce 20
            nonce: '0x5',
            authorizationList: [EOA_AUTHORIZATION, MONEY_ACCOUNT_AUTHORIZATION],
          },
          status: TransactionStatus.submitted,
        },
      ];

      const eoaResult = getAndFormatTransactionsForNonceTracker(
        '0x1',
        EOA_ADDRESS,
        [TransactionStatus.submitted],
        inputTransactions,
      );

      expect(eoaResult).toHaveLength(2);
      expect(eoaResult.map((tx) => tx.txParams.nonce)).toStrictEqual([
        '0x5',
        '0x6',
      ]);
      expect(eoaResult[0].txParams.from).toBe(EOA_ADDRESS);
      expect(eoaResult[1].txParams.from.toLowerCase()).toBe(
        EOA_ADDRESS.toLowerCase(),
      );

      const moneyAccountResult = getAndFormatTransactionsForNonceTracker(
        '0x1',
        MONEY_ACCOUNT_ADDRESS,
        [TransactionStatus.submitted],
        inputTransactions,
      );

      expect(moneyAccountResult).toHaveLength(1);
      expect(moneyAccountResult[0].txParams.nonce).toBe('0x14');
      expect(moneyAccountResult[0].txParams.from.toLowerCase()).toBe(
        MONEY_ACCOUNT_ADDRESS.toLowerCase(),
      );
      expect(moneyAccountResult[0].txParams.gas).toBe('0x100');
      expect(moneyAccountResult[0].txParams.value).toBe('0x200');
    });

    it('excludes signed authorizations that fail authority recovery', () => {
      const inputTransactions: TransactionMeta[] = [
        {
          id: '1',
          chainId: '0x1',
          networkClientId: 'testNetworkClientId',
          time: 123456,
          txParams: {
            from: EOA_ADDRESS,
            gas: '0x100',
            value: '0x200',
            nonce: '0x5',
            authorizationList: [
              {
                address: '0xabc' as Hex,
                chainId: '0x1',
                nonce: '0x6',
                r: '0x0',
                s: '0x0',
                yParity: '0x0',
              },
            ],
          },
          status: TransactionStatus.submitted,
        },
      ];

      const result = getAndFormatTransactionsForNonceTracker(
        '0x1',
        EOA_ADDRESS,
        [TransactionStatus.submitted],
        inputTransactions,
      );

      expect(result).toHaveLength(1);
      expect(result[0].txParams.nonce).toBe('0x5');
    });
  });
});
