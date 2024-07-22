// src/utils/external-transactions.ts
import { rpcErrors } from "@metamask/rpc-errors";
function validateConfirmedExternalTransaction(transactionMeta, confirmedTxs, pendingTxs) {
  if (!transactionMeta || !transactionMeta.txParams) {
    throw rpcErrors.invalidParams(
      '"transactionMeta" or "transactionMeta.txParams" is missing'
    );
  }
  if (transactionMeta.status !== "confirmed" /* confirmed */) {
    throw rpcErrors.invalidParams(
      'External transaction status should be "confirmed"'
    );
  }
  const externalTxNonce = transactionMeta.txParams.nonce;
  if (pendingTxs && pendingTxs.length > 0) {
    const foundPendingTxByNonce = pendingTxs.find(
      (tx) => tx.txParams?.nonce === externalTxNonce
    );
    if (foundPendingTxByNonce) {
      throw rpcErrors.invalidParams(
        "External transaction nonce should not be in pending txs"
      );
    }
  }
  if (confirmedTxs && confirmedTxs.length > 0) {
    const foundConfirmedTxByNonce = confirmedTxs.find(
      (tx) => tx.txParams?.nonce === externalTxNonce
    );
    if (foundConfirmedTxByNonce) {
      throw rpcErrors.invalidParams(
        "External transaction nonce should not be in confirmed txs"
      );
    }
  }
}

export {
  validateConfirmedExternalTransaction
};
//# sourceMappingURL=chunk-FRKQ3Z2L.mjs.map