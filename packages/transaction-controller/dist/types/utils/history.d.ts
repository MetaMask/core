import type { TransactionMeta } from '../types';
/**
 * Build a new version of the provided transaction with an initial history
 * entry, which is just a snapshot of the transaction.
 *
 * @param transactionMeta - TransactionMeta to add initial history snapshot to.
 * @returns A copy of `transactionMeta` with a new `history` property.
 */
export declare function addInitialHistorySnapshot(transactionMeta: TransactionMeta): TransactionMeta;
/**
 * Builds a new version of the transaction with a new history entry if
 * it has a `history` property, or just returns the transaction.
 *
 * @param transactionMeta - TransactionMeta to add history entry to.
 * @param note - Note to add to history entry.
 * @returns A copy of `transactionMeta` with a new `history` entry if it has an
 * existing non-empty `history` array.
 */
export declare function updateTransactionHistory(transactionMeta: TransactionMeta, note: string): TransactionMeta;
//# sourceMappingURL=history.d.ts.map