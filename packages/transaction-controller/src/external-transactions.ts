// These utility functions are exclusively used by `confirmExternalTransaction` method in controller
import { ethErrors } from 'eth-rpc-errors';

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
    throw ethErrors.rpc.invalidParams(
      '"transactionMeta" or "transactionMeta.transaction" is missing',
    );
  }

  if (transactionMeta.status !== TransactionStatus.confirmed) {
    throw ethErrors.rpc.invalidParams(
      'External transaction status should be "confirmed"',
    );
  }

  const externalTxNonce = transactionMeta.transaction.nonce;
  if (pendingTxs && pendingTxs.length > 0) {
    const foundPendingTxByNonce = pendingTxs.find(
      (tx) => tx.transaction?.nonce === externalTxNonce,
    );
    if (foundPendingTxByNonce) {
      throw ethErrors.rpc.invalidParams(
        'External transaction nonce should not be in pending txs',
      );
    }
  }

  if (confirmedTxs && confirmedTxs.length > 0) {
    const foundConfirmedTxByNonce = confirmedTxs.find(
      (tx) => tx.transaction?.nonce === externalTxNonce,
    );
    if (foundConfirmedTxByNonce) {
      throw ethErrors.rpc.invalidParams(
        'External transaction nonce should not be in confirmed txs',
      );
    }
  }
}
