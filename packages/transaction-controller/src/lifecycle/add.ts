import type { TransactionMeta } from '../types.js';
import { addTransactionToState as persistTransaction } from '../utils/state.js';
import type { TransactionStageDependencies } from './types.js';

/** Dependencies needed to persist a newly initialized transaction. */
export type AddTransactionToStateRequest = {
  dependencies: Pick<TransactionStageDependencies, 'messenger' | 'update'>;
  transactionMeta: TransactionMeta;
};

/** Persist metadata after hooks, gas estimation and swaps processing. */
export function addTransactionToState(
  request: AddTransactionToStateRequest,
): void {
  persistTransaction(request.dependencies, request.transactionMeta);
}
