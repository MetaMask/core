import { toHex } from '@metamask/controller-utils';
import { add0x } from '@metamask/utils';
import { cloneDeep } from 'lodash';

import {
  type TransactionHistory,
  TransactionStatus,
  type TransactionMeta,
  type TransactionHistoryEntry,
} from '../types';
import { MAX_HISTORY_LENGTH, updateTransactionHistory } from './history';

describe('History', () => {
  describe('updateTransactionHistory', () => {
    it('does nothing if the history property is missing', () => {
      const mockTransaction = createMockTransaction();
      const originalInputTransaction = cloneDeep(mockTransaction);

      const updatedTransaction = updateTransactionHistory(
        mockTransaction,
        'test update',
      );

      expect(updatedTransaction).toBe(mockTransaction);
      expect(updatedTransaction).toStrictEqual(originalInputTransaction);
    });

    it('does nothing if there have been no changes', () => {
      const originalTransaction = createMockTransaction();
      const mockTransaction = createMockTransaction({ originalTransaction });
      const mockTransactionClone = cloneDeep(mockTransaction);

      const updatedTransaction = updateTransactionHistory(
        mockTransaction,
        'test update',
      );

      expect(updatedTransaction).toBe(mockTransaction);
      expect(updatedTransaction).toStrictEqual(mockTransactionClone);
    });

    it('adds a new history entry', () => {
      const originalTransaction = createMockTransaction();
      const mockTransaction = createMockTransaction({
        originalTransaction,
        partialTransaction: {
          history: [originalTransaction],
          txParams: { from: generateAddress(123) },
        },
      });

      const updatedTransaction = updateTransactionHistory(
        mockTransaction,
        'test update',
      );

      expect(updatedTransaction).not.toBe(mockTransaction);
      expect(updatedTransaction).toStrictEqual({
        ...mockTransaction,
        history: [
          originalTransaction,
          [
            {
              note: 'test update',
              op: 'replace',
              path: '/txParams/from',
              timestamp: expect.any(Number),
              value: generateAddress(123),
            },
          ],
        ],
      });
    });

    describe('when history is past max size with non-displayed entries', () => {
      it('merges a non-displayed entry when adding a new entry after max history size is reached', () => {
        const originalTransaction = createMockTransaction();
        const mockTransaction = createMockTransaction({
          partialTransaction: {
            history: generateMockHistory({
              originalTransaction,
              length: MAX_HISTORY_LENGTH,
            }),
            // This is the changed value
            txParams: { from: generateAddress(123) },
          },
        });
        // Validate that last history entry is correct
        const mockHistoryLength = mockTransaction.history.length;
        expect(mockTransaction.history?.[mockHistoryLength - 1]).toStrictEqual([
          {
            note: 'Mock non-displayed change',
            op: 'replace',
            path: '/txParams/from',
            value: generateAddress(MAX_HISTORY_LENGTH - 1),
          },
        ]);
        expect(mockTransaction.history).toHaveLength(MAX_HISTORY_LENGTH);

        const updatedTransaction = updateTransactionHistory(
          mockTransaction,
          'test update',
        );

        expect(updatedTransaction).not.toBe(mockTransaction);
        expect(updatedTransaction).toStrictEqual({
          ...mockTransaction,
          history: [
            originalTransaction,
            // This is the merged entry of mockTransaction.history[1] and mockTransaction.history[2]
            [
              {
                note: 'Mock non-displayed change, Mock non-displayed change',
                op: 'replace',
                path: '/txParams/from',
                timestamp: expect.any(Number),
                value: generateAddress(2),
              },
            ],
            ...mockTransaction.history.slice(3),
            // This is the new entry:
            [
              {
                note: 'test update',
                op: 'replace',
                path: '/txParams/from',
                timestamp: expect.any(Number),
                value: generateAddress(123),
              },
            ],
          ],
        });
        expect(updatedTransaction.history).toHaveLength(MAX_HISTORY_LENGTH);
      });
    });

    describe('when history is past max size with a single non-displayed entry at the end', () => {
      it('merges a non-displayed entry when adding a new entry after max history size is reached', () => {
        const originalTransaction = createMockTransaction();
        // This matches the last gas price change in the mock history
        const mockTransactionGasPrice = toHex(MAX_HISTORY_LENGTH - 1);
        const mockTransaction = createMockTransaction({
          partialTransaction: {
            history: generateMockHistory({
              numberOfDisplayEntries: MAX_HISTORY_LENGTH - 1,
              originalTransaction,
              length: MAX_HISTORY_LENGTH,
            }),
            txParams: {
              // This is the changed value
              from: generateAddress(123),
              // This matches the last gas price change in the mock history
              gasPrice: mockTransactionGasPrice,
            },
          },
        });
        // Validate that last history entry is correct
        const mockHistoryLength = mockTransaction.history.length;
        expect(mockTransaction.history?.[mockHistoryLength - 1]).toStrictEqual([
          {
            note: 'Mock displayed change',
            op: 'replace',
            path: '/txParams/gasPrice',
            value: mockTransactionGasPrice,
          },
        ]);
        const mockTransactionClone = cloneDeep(mockTransaction);
        expect(mockTransaction.history).toHaveLength(MAX_HISTORY_LENGTH);

        const updatedTransaction = updateTransactionHistory(
          mockTransaction,
          'test update',
        );

        expect(updatedTransaction).not.toBe(mockTransaction);
        expect(updatedTransaction).toStrictEqual({
          ...mockTransaction,
          history: [
            ...mockTransactionClone.history.slice(0, MAX_HISTORY_LENGTH - 1),
            // This is the new merged entry:
            [
              {
                note: 'Mock displayed change, test update',
                op: 'replace',
                path: '/txParams/gasPrice',
                timestamp: expect.any(Number),
                value: mockTransactionGasPrice,
              },
              {
                op: 'replace',
                path: '/txParams/from',
                value: generateAddress(123),
              },
            ],
          ],
        });
        expect(updatedTransaction.history).toHaveLength(MAX_HISTORY_LENGTH);
      });
    });

    describe('when history is past max size with only displayed entries', () => {
      it('adds a new history entry, exceeding max size', () => {
        const originalTransaction = createMockTransaction();
        const mockTransaction = createMockTransaction({
          partialTransaction: {
            history: generateMockHistory({
              numberOfDisplayEntries: MAX_HISTORY_LENGTH - 1,
              originalTransaction,
              length: MAX_HISTORY_LENGTH,
            }),
            txParams: {
              from: originalTransaction.txParams.from,
              // This is the changed value
              gasPrice: toHex(1337),
            },
          },
        });
        // Validate that last history entry is correct
        const mockHistoryLength = mockTransaction.history.length;
        expect(mockTransaction.history?.[mockHistoryLength - 1]).toStrictEqual([
          {
            note: 'Mock displayed change',
            op: 'replace',
            path: '/txParams/gasPrice',
            value: toHex(MAX_HISTORY_LENGTH - 1),
          },
        ]);
        expect(mockTransaction.history).toHaveLength(MAX_HISTORY_LENGTH);

        const updatedTransaction = updateTransactionHistory(
          mockTransaction,
          'test update',
        );

        expect(updatedTransaction).not.toBe(mockTransaction);
        expect(updatedTransaction).toStrictEqual({
          ...mockTransaction,
          history: [
            ...mockTransaction.history,
            // This is the new entry:
            [
              {
                note: 'test update',
                op: 'replace',
                path: '/txParams/gasPrice',
                timestamp: expect.any(Number),
                value: toHex(1337),
              },
            ],
          ],
        });
        expect(updatedTransaction.history).toHaveLength(MAX_HISTORY_LENGTH + 1);
      });
    });
  });
});

/**
 * Create a mock transaction.
 *
 * Optionally an incomplete transaction can be passed in, and any missing required proeprties will
 * be filled out. The 'status' property is not allowed as input only because it was complicated to
 * get the types to be correct if it was provided.
 *
 * A `history` property is included only if an original transaction is passed in.
 *
 * @param options - Options.
 * @param options.partialTransaction - A partial transaction, without a 'status' property.
 * @param options.originalTransaction - The original transaction object to include in the transaction
 * history.
 * @returns A mock transaction.
 */
function createMockTransaction({
  partialTransaction,
  originalTransaction,
}: {
  partialTransaction?: Omit<Partial<TransactionMeta>, 'status'>;
  originalTransaction?: TransactionMeta;
} = {}): TransactionMeta & Required<Pick<TransactionMeta, 'history'>> {
  const minimalTransaction: TransactionMeta = {
    chainId: toHex(1337),
    id: 'mock-id',
    time: 0,
    status: TransactionStatus.submitted as const,
    txParams: {
      from: '',
    },
  };

  if (originalTransaction) {
    minimalTransaction.history = originalTransaction.history || [
      originalTransaction,
    ];
  } else {
    minimalTransaction.history = [{ ...minimalTransaction }];
  }

  return {
    // Cast used here because TypeScript wasn't able to infer that `history` was guaranteed to be set
    ...(minimalTransaction as TransactionMeta &
      Required<Pick<TransactionMeta, 'history'>>),
    ...partialTransaction,
  };
}

/**
 * Generate a mock transaction history.
 *
 * @param args - Arguments.
 * @param args.numberOfDisplayEntries - The number of displayed history entries to generate.
 * @param args.originalTransaction - The original transaction, before any history changes.
 * @param args.length - The total length of history to generate.
 * @returns Mock transaction history.
 */
function generateMockHistory({
  numberOfDisplayEntries = 0,
  originalTransaction,
  length,
}: {
  numberOfDisplayEntries?: number;
  originalTransaction: TransactionMeta;
  length: number;
}): TransactionHistory {
  if (length < 1) {
    throw new Error('Invalid length');
  } else if (numberOfDisplayEntries >= length) {
    throw new Error('Length must exceed number of displayed entries');
  }

  const historyEntries: TransactionHistoryEntry[] = [
    ...Array(length - 1).keys(),
  ].map((index: number) => {
    // Use index of this entry in history array, for better readability/debugging of mock values
    const historyIndex = index + 1;

    return [
      numberOfDisplayEntries < historyIndex
        ? {
            note: 'Mock non-displayed change',
            op: 'replace',
            path: '/txParams/from',
            value: generateAddress(historyIndex),
          }
        : {
            note: 'Mock displayed change',
            op: index === 0 ? 'add' : 'replace',
            path: '/txParams/gasPrice',
            value: toHex(historyIndex),
          },
    ];
  });

  return [originalTransaction, ...historyEntries];
}

/**
 * Generate a mock lowercase Ethereum address.
 *
 * @param number - The address as a decimal number.
 * @returns The mock address
 */
function generateAddress(number: number) {
  return add0x(number.toString(16).padStart(40, '0'));
}
