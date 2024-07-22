"use strict";Object.defineProperty(exports, "__esModule", {value: true}); function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }


var _chunkBTR56Y3Fjs = require('./chunk-BTR56Y3F.js');

// src/utils/transaction.ts



var _transactioncontroller = require('@metamask/transaction-controller');
var _utils = require('@metamask/utils');
var _bnjs = require('bn.js'); var _bnjs2 = _interopRequireDefault(_bnjs);
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
  const effectiveGasPrice = actualGasCost && actualGasUsed ? _utils.add0x.call(void 0, 
    new (0, _bnjs2.default)(_utils.remove0x.call(void 0, actualGasCost), 16).div(new (0, _bnjs2.default)(_utils.remove0x.call(void 0, actualGasUsed), 16)).toString(16)
  ) : void 0;
  const error = rawError ? {
    name: rawError.name,
    message: rawError.message,
    stack: rawError.stack,
    code: rawError.code,
    rpc: rawError.rpc
  } : void 0;
  const status = {
    ["unapproved" /* Unapproved */]: _transactioncontroller.TransactionStatus.unapproved,
    ["approved" /* Approved */]: _transactioncontroller.TransactionStatus.approved,
    ["signed" /* Signed */]: _transactioncontroller.TransactionStatus.signed,
    ["submitted" /* Submitted */]: _transactioncontroller.TransactionStatus.submitted,
    ["confirmed" /* Confirmed */]: _transactioncontroller.TransactionStatus.confirmed,
    ["failed" /* Failed */]: _transactioncontroller.TransactionStatus.failed
  }[metadata.status];
  const gas = addHex(
    userOperation.preVerificationGas,
    userOperation.verificationGasLimit,
    userOperation.callGasLimit
  );
  const hasPaymaster = userOperation.paymasterAndData !== _chunkBTR56Y3Fjs.EMPTY_BYTES;
  const maxFeePerGas = hasPaymaster ? _chunkBTR56Y3Fjs.VALUE_ZERO : userOperation.maxFeePerGas;
  const maxPriorityFeePerGas = hasPaymaster ? _chunkBTR56Y3Fjs.VALUE_ZERO : userOperation.maxPriorityFeePerGas;
  const nonce = userOperation.nonce === _chunkBTR56Y3Fjs.EMPTY_BYTES ? void 0 : userOperation.nonce;
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
  const userFeeLevel = hasPaymaster ? _transactioncontroller.UserFeeLevel.CUSTOM : rawUserFeeLevel;
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
  const total = new (0, _bnjs2.default)(0);
  for (const value of values) {
    if (!value) {
      continue;
    }
    total.iadd(new (0, _bnjs2.default)(_utils.remove0x.call(void 0, value), 16));
  }
  return _utils.add0x.call(void 0, total.toString(16));
}



exports.getTransactionMetadata = getTransactionMetadata;
//# sourceMappingURL=chunk-6ZRFUBLC.js.map