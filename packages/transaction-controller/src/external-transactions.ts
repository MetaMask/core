/* eslint-disable @typescript-eslint/prefer-optional-chain */
// These utility functions are exclusively used by `confirmExternalTransaction` method in controller
import { TransactionStatus } from './types';
import type { TransactionMeta } from './types';

/**
 * Validates the external provided transaction meta.
 *
 * @param transactionMeta - The transaction meta to validate.
 * @param confirmedTxs - The confirmed transactions in controller state.
 * @param pendingTxs - The submitted transactions in controller state.
 */
export function validateConfirmedExternalTransaction(
  transactionMeta?: TransactionMeta,
  confirmedTxs?: TransactionMeta[],
  pendingTxs?: TransactionMeta[],
) {
  if (!transactionMeta || !transactionMeta.transaction) {
    throw new Error(
      '"transactionMeta" or "transactionMeta.transaction" is missing',
    );
  }

  if (transactionMeta.status !== TransactionStatus.confirmed) {
    throw new Error('External transaction status should be "confirmed"');
  }

  const externalTxNonce = transactionMeta.transaction.nonce;
  if (pendingTxs && pendingTxs.length > 0) {
    const foundPendingTxByNonce = pendingTxs.find(
      (tx) => tx.transaction?.nonce === externalTxNonce,
    );
    if (foundPendingTxByNonce) {
      throw new Error(
        'External transaction nonce should not be in pending txs',
      );
    }
  }

  if (confirmedTxs && confirmedTxs.length > 0) {
    const foundConfirmedTxByNonce = confirmedTxs.find(
      (tx) => tx.transaction?.nonce === externalTxNonce,
    );
    if (foundConfirmedTxByNonce) {
      throw new Error(
        'External transaction nonce should not be in confirmed txs',
      );
    }
  }
}
