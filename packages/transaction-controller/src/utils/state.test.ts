import type { Hex } from '@metamask/utils';

import type { TransactionStageDependencies } from '../lifecycle/types.js';
import type {
  TransactionControllerMessenger,
  TransactionControllerState,
} from '../TransactionController.js';
import type { TransactionMeta } from '../types.js';
import { TransactionStatus } from '../types.js';
import { getTransactionHistoryLimit } from './feature-flags.js';
import {
  deleteTransaction,
  getTransaction,
  getTransactionOrThrow,
  isFinalState,
  isTransactionCompleted,
  trimTransactionsForState,
} from './state.js';

jest.mock('./feature-flags.js');

const CHAIN_ID_MOCK = '0x1' as Hex;
const CHAIN_ID_2_MOCK = '0x5' as Hex;
const DAY_MS = 24 * 60 * 60 * 1000;
const MESSENGER_MOCK = {} as TransactionControllerMessenger;
const TIME_MOCK = new Date('2026-01-15T12:00:00Z').getTime();

const FINAL_STATUSES = [
  TransactionStatus.confirmed,
  TransactionStatus.dropped,
  TransactionStatus.failed,
  TransactionStatus.rejected,
];

const NON_FINAL_STATUSES = [
  TransactionStatus.approved,
  TransactionStatus.signed,
  TransactionStatus.submitted,
  TransactionStatus.unapproved,
];

describe('state utils', () => {
  const getTransactionHistoryLimitMock = jest.mocked(
    getTransactionHistoryLimit,
  );

  beforeEach(() => {
    getTransactionHistoryLimitMock.mockReturnValue(undefined);
  });

  describe('getTransaction', () => {
    it('returns the transaction with the matching id', () => {
      const transactions = [buildMeta({ id: '1' }), buildMeta({ id: '2' })];

      expect(getTransaction({ transactions }, '2')).toBe(transactions[1]);
    });

    it('returns undefined if no transaction matches', () => {
      expect(
        getTransaction({ transactions: [buildMeta({ id: '1' })] }, '2'),
      ).toBeUndefined();
    });
  });

  describe('getTransactionOrThrow', () => {
    it('returns the transaction with the matching id', () => {
      const transactionMeta = buildMeta({ id: '1' });

      expect(
        getTransactionOrThrow({ transactions: [transactionMeta] }, '1'),
      ).toBe(transactionMeta);
    });

    it('throws with the default prefix if no transaction matches', () => {
      expect(() => getTransactionOrThrow({ transactions: [] }, '1')).toThrow(
        'TransactionController: No transaction found with id 1',
      );
    });

    it('throws with a custom prefix if provided', () => {
      expect(() =>
        getTransactionOrThrow({ transactions: [] }, '1', 'Custom'),
      ).toThrow('Custom: No transaction found with id 1');
    });
  });

  describe('isFinalState', () => {
    it.each(FINAL_STATUSES)('returns true if status is %s', (status) => {
      expect(isFinalState(status)).toBe(true);
    });

    it.each(NON_FINAL_STATUSES)('returns false if status is %s', (status) => {
      expect(isFinalState(status)).toBe(false);
    });
  });

  describe('isTransactionCompleted', () => {
    it.each([
      TransactionStatus.confirmed,
      TransactionStatus.failed,
      TransactionStatus.rejected,
      TransactionStatus.submitted,
    ])('returns completed with metadata if status is %s', (status) => {
      const transactionMeta = buildMeta({ id: '1', status });

      expect(
        isTransactionCompleted({ transactions: [transactionMeta] }, '1'),
      ).toStrictEqual({ isCompleted: true, meta: transactionMeta });
    });

    it.each([
      TransactionStatus.approved,
      TransactionStatus.dropped,
      TransactionStatus.signed,
      TransactionStatus.unapproved,
    ])('returns not completed with metadata if status is %s', (status) => {
      const transactionMeta = buildMeta({ id: '1', status });

      expect(
        isTransactionCompleted({ transactions: [transactionMeta] }, '1'),
      ).toStrictEqual({ isCompleted: false, meta: transactionMeta });
    });

    it('returns not completed without metadata if transaction is missing', () => {
      expect(isTransactionCompleted({ transactions: [] }, '1')).toStrictEqual({
        isCompleted: false,
        meta: undefined,
      });
    });
  });

  describe('trimTransactionsForState', () => {
    it('returns the input unchanged if there is no history limit', () => {
      const transactions = [buildMeta({ id: '1' }), buildMeta({ id: '2' })];

      expect(trimTransactionsForState(transactions, MESSENGER_MOCK)).toBe(
        transactions,
      );
    });

    it('reads the history limit using the messenger', () => {
      trimTransactionsForState([], MESSENGER_MOCK);

      expect(getTransactionHistoryLimitMock).toHaveBeenCalledWith(
        MESSENGER_MOCK,
      );
    });

    it('keeps the newest final transactions up to the limit', () => {
      getTransactionHistoryLimitMock.mockReturnValue(2);

      const transactions = [
        buildMeta({ id: '1', nonce: '0x1', time: TIME_MOCK + 1 }),
        buildMeta({ id: '2', nonce: '0x2', time: TIME_MOCK + 2 }),
        buildMeta({ id: '3', nonce: '0x3', time: TIME_MOCK + 3 }),
      ];

      expect(
        getIds(trimTransactionsForState(transactions, MESSENGER_MOCK)),
      ).toStrictEqual(['2', '3']);
    });

    it('returns transactions in ascending time order', () => {
      getTransactionHistoryLimitMock.mockReturnValue(10);

      const transactions = [
        buildMeta({ id: '3', nonce: '0x3', time: TIME_MOCK + 3 }),
        buildMeta({ id: '1', nonce: '0x1', time: TIME_MOCK + 1 }),
        buildMeta({ id: '2', nonce: '0x2', time: TIME_MOCK + 2 }),
      ];

      expect(
        getIds(trimTransactionsForState(transactions, MESSENGER_MOCK)),
      ).toStrictEqual(['1', '2', '3']);
    });

    it('keeps transactions sharing a nonce, network and day as one entry', () => {
      getTransactionHistoryLimitMock.mockReturnValue(1);

      const transactions = [
        buildMeta({ id: '1', nonce: '0x1', time: TIME_MOCK + 1 }),
        buildMeta({ id: '2', nonce: '0x2', time: TIME_MOCK + 2 }),
        buildMeta({ id: '3', nonce: '0x2', time: TIME_MOCK + 3 }),
      ];

      expect(
        getIds(trimTransactionsForState(transactions, MESSENGER_MOCK)),
      ).toStrictEqual(['2', '3']);
    });

    it('counts the same nonce on a different network as a separate entry', () => {
      getTransactionHistoryLimitMock.mockReturnValue(1);

      const transactions = [
        buildMeta({
          chainId: CHAIN_ID_2_MOCK,
          id: '1',
          nonce: '0x1',
          time: TIME_MOCK + 1,
        }),
        buildMeta({ id: '2', nonce: '0x1', time: TIME_MOCK + 2 }),
      ];

      expect(
        getIds(trimTransactionsForState(transactions, MESSENGER_MOCK)),
      ).toStrictEqual(['2']);
    });

    it('counts the same nonce on a different day as a separate entry', () => {
      getTransactionHistoryLimitMock.mockReturnValue(1);

      const transactions = [
        buildMeta({ id: '1', nonce: '0x1', time: TIME_MOCK - DAY_MS }),
        buildMeta({ id: '2', nonce: '0x1', time: TIME_MOCK }),
      ];

      expect(
        getIds(trimTransactionsForState(transactions, MESSENGER_MOCK)),
      ).toStrictEqual(['2']);
    });

    it.each(NON_FINAL_STATUSES)(
      'retains %s transactions beyond the limit',
      (status) => {
        getTransactionHistoryLimitMock.mockReturnValue(1);

        const transactions = [
          buildMeta({ id: '1', nonce: '0x1', status, time: TIME_MOCK + 1 }),
          buildMeta({ id: '2', nonce: '0x2', time: TIME_MOCK + 2 }),
          buildMeta({ id: '3', nonce: '0x3', time: TIME_MOCK + 3 }),
        ];

        expect(
          getIds(trimTransactionsForState(transactions, MESSENGER_MOCK)),
        ).toStrictEqual(['1', '3']);
      },
    );

    it('drops transactions without params', () => {
      getTransactionHistoryLimitMock.mockReturnValue(10);

      const transactions = [
        buildMeta({ id: '1', nonce: '0x1', time: TIME_MOCK + 1 }),
        {
          ...buildMeta({ id: '2', time: TIME_MOCK + 2 }),
          txParams: undefined,
        } as unknown as TransactionMeta,
      ];

      expect(
        getIds(trimTransactionsForState(transactions, MESSENGER_MOCK)),
      ).toStrictEqual(['1']);
    });

    it('does not mutate the input array', () => {
      getTransactionHistoryLimitMock.mockReturnValue(1);

      const transactions = [
        buildMeta({ id: '2', nonce: '0x2', time: TIME_MOCK + 2 }),
        buildMeta({ id: '1', nonce: '0x1', time: TIME_MOCK + 1 }),
      ];

      trimTransactionsForState(transactions, MESSENGER_MOCK);

      expect(getIds(transactions)).toStrictEqual(['2', '1']);
    });
  });

  describe('deleteTransaction', () => {
    it('removes the transaction from state', () => {
      const { dependencies, state } = buildDependencies([
        buildMeta({ id: '1', nonce: '0x1', time: TIME_MOCK + 1 }),
        buildMeta({ id: '2', nonce: '0x2', time: TIME_MOCK + 2 }),
      ]);

      deleteTransaction(dependencies, '1');

      expect(getIds(state.transactions)).toStrictEqual(['2']);
    });

    it('leaves state unchanged if the transaction is missing', () => {
      const { dependencies, state } = buildDependencies([
        buildMeta({ id: '1', nonce: '0x1', time: TIME_MOCK + 1 }),
      ]);

      deleteTransaction(dependencies, '2');

      expect(getIds(state.transactions)).toStrictEqual(['1']);
    });

    it('applies the history limit to the remaining transactions', () => {
      getTransactionHistoryLimitMock.mockReturnValue(1);

      const { dependencies, state } = buildDependencies([
        buildMeta({ id: '1', nonce: '0x1', time: TIME_MOCK + 1 }),
        buildMeta({ id: '2', nonce: '0x2', time: TIME_MOCK + 2 }),
        buildMeta({ id: '3', nonce: '0x3', time: TIME_MOCK + 3 }),
      ]);

      deleteTransaction(dependencies, '3');

      expect(getIds(state.transactions)).toStrictEqual(['2']);
      expect(getTransactionHistoryLimitMock).toHaveBeenCalledWith(
        MESSENGER_MOCK,
      );
    });
  });
});

/**
 * Build stage dependencies backed by a mutable in-memory state.
 *
 * @param transactions - Initial transactions in state.
 * @returns The dependencies and the state they mutate.
 */
function buildDependencies(transactions: TransactionMeta[]): {
  dependencies: TransactionStageDependencies;
  state: Pick<TransactionControllerState, 'transactions'>;
} {
  const state = { transactions };

  const dependencies = {
    messenger: MESSENGER_MOCK,
    updateState: (
      fn: (draft: Pick<TransactionControllerState, 'transactions'>) => void,
    ): void => fn(state),
  } as unknown as TransactionStageDependencies;

  return { dependencies, state };
}

/**
 * Build minimal transaction metadata for trimming and lookup tests.
 *
 * @param options - Overrides for the generated metadata.
 * @param options.chainId - Chain ID of the transaction.
 * @param options.id - Transaction ID.
 * @param options.nonce - Nonce in the transaction params.
 * @param options.status - Transaction status.
 * @param options.time - Creation time of the transaction.
 * @returns The transaction metadata.
 */
function buildMeta({
  chainId = CHAIN_ID_MOCK,
  id,
  nonce = '0x0',
  status = TransactionStatus.confirmed,
  time = TIME_MOCK,
}: {
  chainId?: Hex;
  id: string;
  nonce?: string;
  status?: TransactionStatus;
  time?: number;
}): TransactionMeta {
  return {
    chainId,
    id,
    networkClientId: 'mainnet',
    status,
    time,
    txParams: { from: '0x1', nonce },
  };
}

/**
 * Extract the IDs of the given transactions.
 *
 * @param transactions - Transactions to read.
 * @returns The transaction IDs in order.
 */
function getIds(transactions: TransactionMeta[]): string[] {
  return transactions.map(({ id }) => id);
}
