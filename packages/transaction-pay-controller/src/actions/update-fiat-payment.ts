import { createModuleLogger } from '@metamask/utils';

import { projectLogger } from '../logger.js';
import type {
  UpdateFiatPaymentRequest,
  UpdateTransactionDataCallback,
} from '../types.js';
import { getTransaction } from '../utils/transaction.js';
import type { TransactionPayControllerMessenger } from './../index.js';

const log = createModuleLogger(projectLogger, 'update-fiat-payment');

export type UpdateFiatPaymentOptions = {
  messenger: TransactionPayControllerMessenger;
  updateTransactionData: UpdateTransactionDataCallback;
};

/**
 * Update fiat payment state for a specific transaction.
 *
 * @param request - Request parameters.
 * @param options - Options bag.
 */
export function updateFiatPayment(
  request: UpdateFiatPaymentRequest,
  options: UpdateFiatPaymentOptions,
): void {
  const { transactionId, callback } = request;
  const { messenger, updateTransactionData } = options;

  const transaction = getTransaction(transactionId, messenger);

  if (!transaction) {
    throw new Error('Transaction not found');
  }

  log('Updated fiat payment', { transactionId });

  updateTransactionData(transactionId, (data) => {
    const currentFiatPayment = data.fiatPayment ?? {};
    callback(currentFiatPayment);

    data.fiatPayment = currentFiatPayment;
  });
}
