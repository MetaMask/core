import { createModuleLogger, lifecycleLogger } from '../logger.js';
import type { TransactionMeta } from '../types.js';
import { trimTransactionsForState } from '../utils/state.js';
import { validateTxParams } from '../utils/validation.js';
import type { TransactionStageDependencies } from './types.js';

const log = createModuleLogger(lifecycleLogger, 'add');

/**
 * Validate and persist metadata, applying the current history limit.
 *
 * @param dependencies - Controller state mutation and feature-flag access.
 * @param dependencies.messenger - Messenger used to resolve the history limit.
 * @param dependencies.updateState - Callback to mutate controller state.
 * @param transactionMeta - Transaction to add to state.
 */
export function addTransactionToState(
  { messenger, updateState }: TransactionStageDependencies,
  transactionMeta: TransactionMeta,
): void {
  validateTxParams(transactionMeta.txParams);

  log('Adding transaction to state', transactionMeta.id);

  updateState((state) => {
    state.transactions = trimTransactionsForState(
      [...state.transactions, transactionMeta],
      messenger,
    );
  });
}
