import { deriveFiatAssetForFiatPayment } from '../strategy/fiat/utils';
import type {
  TransactionPayControllerMessenger,
  UpdateTransactionDataCallback,
} from '../types';
import { buildCaipAssetType } from './token';
import { getTransaction } from './transaction';

/**
 * Ensures the selected Ramps provider supports the fiat asset
 * required by the given transaction.
 *
 * Derives the fiat asset from the transaction type and feature flags,
 * then delegates to `RampsController:ensureProviderForAsset` which
 * auto-selects a supporting provider when the current one cannot
 * fulfill the asset.
 *
 * @param options - The options.
 * @param options.transactionId - ID of the transaction.
 * @param options.messenger - Controller messenger.
 */
export function ensureProviderForFiatAsset({
  transactionId,
  messenger,
}: {
  transactionId: string;
  messenger: TransactionPayControllerMessenger;
}): void {
  const transaction = getTransaction(transactionId, messenger);

  if (!transaction) {
    return;
  }

  const fiatAsset = deriveFiatAssetForFiatPayment(transaction, messenger);

  if (fiatAsset) {
    messenger.call(
      'RampsController:ensureProviderForAsset',
      buildCaipAssetType(fiatAsset.chainId, fiatAsset.address),
    );
  }
}

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
