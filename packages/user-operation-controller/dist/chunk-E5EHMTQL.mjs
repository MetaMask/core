import {
  EMPTY_BYTES,
  VALUE_ZERO
} from "./chunk-TPPISKNS.mjs";

// src/utils/transaction.ts
import {
  TransactionStatus,
  UserFeeLevel
} from "@metamask/transaction-controller";
import { add0x, remove0x } from "@metamask/utils";
import BN from "bn.js";
function getTransactionMetadata(metadata) {
  const {
    actualGasCost,
    actualGasUsed,
    baseFeePerGas,
    chainId,
    error: rawError,
    origin,
    transactionHash,
    id,
    swapsMetadata,
    time,
    transactionParams,
    transactionType,
    userFeeLevel: rawUserFeeLevel,
    userOperation
  } = metadata;
  if (!transactionParams) {
    return void 0;
  }
  const effectiveGasPrice = actualGasCost && actualGasUsed ? add0x(
    new BN(remove0x(actualGasCost), 16).div(new BN(remove0x(actualGasUsed), 16)).toString(16)
  ) : void 0;
  const error = rawError ? {
    name: rawError.name,
    message: rawError.message,
    stack: rawError.stack,
    code: rawError.code,
    rpc: rawError.rpc
  } : void 0;
  const status = {
    ["unapproved" /* Unapproved */]: TransactionStatus.unapproved,
    ["approved" /* Approved */]: TransactionStatus.approved,
    ["signed" /* Signed */]: TransactionStatus.signed,
    ["submitted" /* Submitted */]: TransactionStatus.submitted,
    ["confirmed" /* Confirmed */]: TransactionStatus.confirmed,
    ["failed" /* Failed */]: TransactionStatus.failed
  }[metadata.status];
  const gas = addHex(
    userOperation.preVerificationGas,
    userOperation.verificationGasLimit,
    userOperation.callGasLimit
  );
  const hasPaymaster = userOperation.paymasterAndData !== EMPTY_BYTES;
  const maxFeePerGas = hasPaymaster ? VALUE_ZERO : userOperation.maxFeePerGas;
  const maxPriorityFeePerGas = hasPaymaster ? VALUE_ZERO : userOperation.maxPriorityFeePerGas;
  const nonce = userOperation.nonce === EMPTY_BYTES ? void 0 : userOperation.nonce;
  const txParams = {
    ...transactionParams,
    from: userOperation.sender,
    gas,
    nonce,
    maxFeePerGas,
    maxPriorityFeePerGas
  };
  delete txParams.gasPrice;
  const swaps = {
    approvalTxId: swapsMetadata?.approvalTxId ?? void 0,
    destinationTokenAddress: swapsMetadata?.destinationTokenAddress ?? void 0,
    destinationTokenAmount: swapsMetadata?.destinationTokenAmount ?? void 0,
    destinationTokenDecimals: swapsMetadata?.destinationTokenDecimals ?? void 0,
    destinationTokenSymbol: swapsMetadata?.destinationTokenSymbol ?? void 0,
    estimatedBaseFee: swapsMetadata?.estimatedBaseFee ?? void 0,
    sourceTokenAddress: swapsMetadata?.sourceTokenAddress ?? void 0,
    sourceTokenAmount: swapsMetadata?.sourceTokenAmount ?? void 0,
    sourceTokenDecimals: swapsMetadata?.sourceTokenDecimals ?? void 0,
    sourceTokenSymbol: swapsMetadata?.sourceTokenSymbol ?? void 0,
    swapAndSendRecipient: swapsMetadata?.swapAndSendRecipient ?? void 0,
    swapMetaData: swapsMetadata?.swapMetaData ?? void 0,
    swapTokenValue: swapsMetadata?.swapTokenValue ?? void 0
  };
  const userFeeLevel = hasPaymaster ? UserFeeLevel.CUSTOM : rawUserFeeLevel;
  return {
    baseFeePerGas: baseFeePerGas ?? void 0,
    chainId,
    error,
    hash: transactionHash ?? void 0,
    id,
    isUserOperation: true,
    origin,
    status,
    time,
    txParams,
    txReceipt: {
      effectiveGasPrice: effectiveGasPrice ?? void 0,
      gasUsed: actualGasUsed ?? void 0
    },
    type: transactionType ?? void 0,
    userFeeLevel,
    ...swaps
  };
}
function addHex(...values) {
  const total = new BN(0);
  for (const value of values) {
    if (!value) {
      continue;
    }
    total.iadd(new BN(remove0x(value), 16));
  }
  return add0x(total.toString(16));
}

export {
  getTransactionMetadata
};
//# sourceMappingURL=chunk-E5EHMTQL.mjs.map