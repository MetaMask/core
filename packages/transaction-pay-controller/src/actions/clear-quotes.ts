import { createModuleLogger } from '@metamask/utils';

import type { TransactionPayControllerMessenger } from '..';
import { projectLogger } from '../logger';
import type {
  ClearQuotesRequest,
  UpdateTransactionDataCallback,
} from '../types';

const log = createModuleLogger(projectLogger, 'clear-quotes');

const abortControllersByTransactionId: Record<string, AbortController> = {};

export type ClearQuotesOptions = {
  messenger: TransactionPayControllerMessenger;
  updateTransactionData: UpdateTransactionDataCallback;
};

/**
 * Clear the quotes for a specific transaction.
 *
 * @param request  - Request parameters.
 * @param options - Options bag.
 */
export function clearQuotes(
  request: ClearQuotesRequest,
  options: ClearQuotesOptions,
) {
  const { reason: requestReason, transactionId } = request;
  const { updateTransactionData } = options;
  const reason = requestReason ?? 'Clear quotes action';

  getAbortController(transactionId).abort(reason);
  delete abortControllersByTransactionId[transactionId];

  updateTransactionData(transactionId, (data) => {
    data.isLoading = false;
    data.quotes = undefined;
    data.sourceAmounts = undefined;
    data.totals = undefined;
  });

  log('Cleared quotes', { transactionId, reason });
}

/**
 * Get the AbortSignal for a specific transaction.
 *
 * @param transactionId - ID of the transaction.
 * @returns AbortSignal instance.
 */
export function getAbortSignal(transactionId: string) {
  return getAbortController(transactionId).signal;
}

/**
 * Get or create an AbortController for a specific transaction.
 *
 * @param transactionId  - ID of the transaction.
 * @returns - AbortController instance.
 */
function getAbortController(transactionId: string) {
  let abortController = abortControllersByTransactionId[transactionId];

  if (!abortController) {
    abortController = new AbortController();
    abortControllersByTransactionId[transactionId] = abortController;
  }

  return abortController;
}
