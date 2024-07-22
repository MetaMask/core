"use strict";Object.defineProperty(exports, "__esModule", {value: true});


var _chunkS6VGOPUYjs = require('./chunk-S6VGOPUY.js');

// src/utils/nonce.ts
var _controllerutils = require('@metamask/controller-utils');
var log = _chunkS6VGOPUYjs.createModuleLogger.call(void 0, _chunkS6VGOPUYjs.projectLogger, "nonce");
async function getNextNonce(txMeta, getNonceLock) {
  const {
    customNonceValue,
    txParams: { from, nonce: existingNonce }
  } = txMeta;
  const customNonce = customNonceValue ? _controllerutils.toHex.call(void 0, customNonceValue) : void 0;
  if (customNonce) {
    log("Using custom nonce", customNonce);
    return [customNonce, void 0];
  }
  if (existingNonce) {
    log("Using existing nonce", existingNonce);
    return [existingNonce, void 0];
  }
  const nonceLock = await getNonceLock(from);
  const nonce = _controllerutils.toHex.call(void 0, nonceLock.nextNonce);
  const releaseLock = nonceLock.releaseLock.bind(nonceLock);
  log("Using nonce from nonce tracker", nonce, nonceLock.nonceDetails);
  return [nonce, releaseLock];
}
function getAndFormatTransactionsForNonceTracker(currentChainId, fromAddress, transactionStatus, transactions) {
  return transactions.filter(
    ({ chainId, isTransfer, isUserOperation, status, txParams: { from } }) => !isTransfer && !isUserOperation && chainId === currentChainId && status === transactionStatus && from.toLowerCase() === fromAddress.toLowerCase()
  ).map(({ status, txParams: { from, gas, value, nonce } }) => {
    return {
      status,
      history: [{}],
      txParams: {
        from: from ?? "",
        gas: gas ?? "",
        value: value ?? "",
        nonce: nonce ?? ""
      }
    };
  });
}




exports.getNextNonce = getNextNonce; exports.getAndFormatTransactionsForNonceTracker = getAndFormatTransactionsForNonceTracker;
//# sourceMappingURL=chunk-PRUNMTRD.js.map