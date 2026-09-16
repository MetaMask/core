import type { TransactionMeta } from '../types.js';
import { trimTransactionsForState } from '../utils/state.js';
import { validateTxParams } from '../utils/validation.js';
import type { TransactionStageDependencies } from './types.js';

/**
 * Validate and persist metadata, applying the current history limit.
 *
 * @param dependencies - Controller state mutation and feature-flag access.
 * @param transactionMeta - Transaction to add to state.
 */
export function addTransactionToState(
  { messenger, updateState }: TransactionStageDependencies,
  transactionMeta: TransactionMeta,
): void {
  validateTxParams(transactionMeta.txParams);

  updateState((state) => {
    state.transactions = trimTransactionsForState(
      [...state.transactions, transactionMeta],
      messenger,
    );
  });
}
