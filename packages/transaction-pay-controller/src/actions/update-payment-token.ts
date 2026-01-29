import { createModuleLogger } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import type { TransactionPayControllerMessenger } from '..';
import { projectLogger } from '../logger';
import type {
  UpdatePaymentTokenRequest,
  UpdateTransactionDataCallback,
} from '../types';
import { buildTokenData } from '../utils/token';
import { getTransaction } from '../utils/transaction';

const log = createModuleLogger(projectLogger, 'update-payment-token');

export type UpdatePaymentTokenOptions = {
  messenger: TransactionPayControllerMessenger;
  updateTransactionData: UpdateTransactionDataCallback;
};

/**
 * Update the payment token for a specific transaction.
 *
 * @param request  - Request parameters.
 * @param options - Options bag.
 */
export function updatePaymentToken(
  request: UpdatePaymentTokenRequest,
  options: UpdatePaymentTokenOptions,
): void {
  const { transactionId, tokenAddress, chainId } = request;
  const { messenger, updateTransactionData } = options;

  const transaction = getTransaction(transactionId, messenger);

  if (!transaction) {
    throw new Error('Transaction not found');
  }

  const paymentToken = buildTokenData({
    chainId,
    from: transaction?.txParams.from as Hex,
    messenger,
    tokenAddress,
  });

  if (!paymentToken) {
    throw new Error('Payment token not found');
  }

  log('Updated payment token', { transactionId, paymentToken });

  updateTransactionData(transactionId, (data) => {
    data.paymentToken = paymentToken;
  });
}
