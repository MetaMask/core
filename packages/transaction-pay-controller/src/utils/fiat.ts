import { deriveFiatAssetForFiatPayment } from '../strategy/fiat/utils';
import type {
  TransactionPayControllerMessenger,
  UpdateTransactionDataCallback,
} from '../types';
import { buildCaipAssetType } from './token';
import { getTransaction } from './transaction';

/**
 * Updates the CAIP asset ID stored in the transaction's fiat payment
 * state based on the transaction type and feature flags.
 *
 * @param options - The options.
 * @param options.transactionId - ID of the transaction.
 * @param options.messenger - Controller messenger.
 * @param options.updateTransactionData - Callback to update transaction data.
 */
export function updateFiatAssetId({
  transactionId,
  messenger,
  updateTransactionData,
}: {
  transactionId: string;
  messenger: TransactionPayControllerMessenger;
  updateTransactionData: UpdateTransactionDataCallback;
}): void {
  const transaction = getTransaction(transactionId, messenger);

  if (!transaction) {
    return;
  }

  const fiatAsset = deriveFiatAssetForFiatPayment(transaction, messenger);

  if (fiatAsset) {
    updateTransactionData(transactionId, (data) => {
      if (data.fiatPayment) {
        data.fiatPayment.caipAssetId = buildCaipAssetType(
          fiatAsset.chainId,
          fiatAsset.address,
        );
      }
    });
  }
}
