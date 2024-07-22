import {
  createModuleLogger,
  projectLogger
} from "./chunk-UQQWZT6C.mjs";

// src/utils/nonce.ts
import { toHex } from "@metamask/controller-utils";
var log = createModuleLogger(projectLogger, "nonce");
async function getNextNonce(txMeta, getNonceLock) {
  const {
    customNonceValue,
    txParams: { from, nonce: existingNonce }
  } = txMeta;
  const customNonce = customNonceValue ? toHex(customNonceValue) : void 0;
  if (customNonce) {
    log("Using custom nonce", customNonce);
    return [customNonce, void 0];
  }
  if (existingNonce) {
    log("Using existing nonce", existingNonce);
    return [existingNonce, void 0];
  }
  const nonceLock = await getNonceLock(from);
  const nonce = toHex(nonceLock.nextNonce);
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

export {
  getNextNonce,
  getAndFormatTransactionsForNonceTracker
};
//# sourceMappingURL=chunk-6DDVVUJC.mjs.map