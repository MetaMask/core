"use strict";Object.defineProperty(exports, "__esModule", {value: true});// src/utils/external-transactions.ts
var _rpcerrors = require('@metamask/rpc-errors');
function validateConfirmedExternalTransaction(transactionMeta, confirmedTxs, pendingTxs) {
  if (!transactionMeta || !transactionMeta.txParams) {
    throw _rpcerrors.rpcErrors.invalidParams(
      '"transactionMeta" or "transactionMeta.txParams" is missing'
    );
  }
  if (transactionMeta.status !== "confirmed" /* confirmed */) {
    throw _rpcerrors.rpcErrors.invalidParams(
      'External transaction status should be "confirmed"'
    );
  }
  const externalTxNonce = transactionMeta.txParams.nonce;
  if (pendingTxs && pendingTxs.length > 0) {
    const foundPendingTxByNonce = pendingTxs.find(
      (tx) => tx.txParams?.nonce === externalTxNonce
    );
    if (foundPendingTxByNonce) {
      throw _rpcerrors.rpcErrors.invalidParams(
        "External transaction nonce should not be in pending txs"
      );
    }
  }
  if (confirmedTxs && confirmedTxs.length > 0) {
    const foundConfirmedTxByNonce = confirmedTxs.find(
      (tx) => tx.txParams?.nonce === externalTxNonce
    );
    if (foundConfirmedTxByNonce) {
      throw _rpcerrors.rpcErrors.invalidParams(
        "External transaction nonce should not be in confirmed txs"
      );
    }
  }
}



exports.validateConfirmedExternalTransaction = validateConfirmedExternalTransaction;
//# sourceMappingURL=chunk-7LXE4KHV.js.map