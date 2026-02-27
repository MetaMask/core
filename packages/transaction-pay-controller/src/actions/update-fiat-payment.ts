import { createModuleLogger } from '@metamask/utils';
import { pickBy } from 'lodash';

import type { TransactionPayControllerMessenger } from '..';
import { projectLogger } from '../logger';
import type {
  UpdateFiatPaymentRequest,
  UpdateTransactionDataCallback,
} from '../types';
import { getTransaction } from '../utils/transaction';

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
  const { transactionId, selectedPaymentMethodId, amount } = request;
  const { messenger, updateTransactionData } = options;

  const transaction = getTransaction(transactionId, messenger);

  if (!transaction) {
    throw new Error('Transaction not found');
  }

  log('Updated fiat payment', {
    transactionId,
    selectedPaymentMethodId,
    amount,
  });

  updateTransactionData(transactionId, (data) => {
    const currentFiatPayment = data.fiatPayment ?? {
      amount: null,
      selectedPaymentMethodId: null,
    };

    const patch = pickBy(
      {
        amount,
        selectedPaymentMethodId,
      },
      (value) => value !== undefined,
    ) as Partial<typeof currentFiatPayment>;

    data.fiatPayment = {
      ...currentFiatPayment,
      ...patch,
    };

    // We may need to update the payment token here later
  });
}
