// These utility functions are exclusively used by `confirmExternalTransaction` method in controller
import { rpcErrors } from '@metamask/rpc-errors';

import { TransactionStatus } from '../types';
import type { TransactionMeta } from '../types';

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
  if (!transactionMeta || !transactionMeta.txParams) {
    throw rpcErrors.invalidParams(
      '"transactionMeta" or "transactionMeta.txParams" is missing',
    );
  }

  if (transactionMeta.status !== TransactionStatus.confirmed) {
    throw rpcErrors.invalidParams(
      'External transaction status should be "confirmed"',
    );
  }

  const externalTxNonce = transactionMeta.txParams.nonce;
  if (pendingTxs && pendingTxs.length > 0) {
    const foundPendingTxByNonce = pendingTxs.find(
      (tx) => tx.txParams?.nonce === externalTxNonce,
    );
    if (foundPendingTxByNonce) {
      throw rpcErrors.invalidParams(
        'External transaction nonce should not be in pending txs',
      );
    }
  }

  if (confirmedTxs && confirmedTxs.length > 0) {
    const foundConfirmedTxByNonce = confirmedTxs.find(
      (tx) => tx.txParams?.nonce === externalTxNonce,
    );
    if (foundConfirmedTxByNonce) {
      throw rpcErrors.invalidParams(
        'External transaction nonce should not be in confirmed txs',
      );
    }
  }
}
