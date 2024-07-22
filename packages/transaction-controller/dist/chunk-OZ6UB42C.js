"use strict";Object.defineProperty(exports, "__esModule", {value: true});// src/utils/utils.ts
var _controllerutils = require('@metamask/controller-utils');




var _utils = require('@metamask/utils');
var ESTIMATE_GAS_ERROR = "eth_estimateGas rpc method error";
var NORMALIZERS = {
  data: (data) => _utils.add0x.call(void 0, padHexToEvenLength(data)),
  from: (from) => _utils.add0x.call(void 0, from).toLowerCase(),
  gas: (gas) => _utils.add0x.call(void 0, gas),
  gasLimit: (gas) => _utils.add0x.call(void 0, gas),
  gasPrice: (gasPrice) => _utils.add0x.call(void 0, gasPrice),
  nonce: (nonce) => _utils.add0x.call(void 0, nonce),
  to: (to) => _utils.add0x.call(void 0, to).toLowerCase(),
  value: (value) => _utils.add0x.call(void 0, value),
  maxFeePerGas: (maxFeePerGas) => _utils.add0x.call(void 0, maxFeePerGas),
  maxPriorityFeePerGas: (maxPriorityFeePerGas) => _utils.add0x.call(void 0, maxPriorityFeePerGas),
  estimatedBaseFee: (maxPriorityFeePerGas) => _utils.add0x.call(void 0, maxPriorityFeePerGas),
  type: (type) => _utils.add0x.call(void 0, type)
};
function normalizeTransactionParams(txParams) {
  const normalizedTxParams = { from: "" };
  for (const key of _utils.getKnownPropertyNames.call(void 0, NORMALIZERS)) {
    if (txParams[key]) {
      normalizedTxParams[key] = NORMALIZERS[key](txParams[key]);
    }
  }
  if (!normalizedTxParams.value) {
    normalizedTxParams.value = "0x0";
  }
  return normalizedTxParams;
}
function isEIP1559Transaction(txParams) {
  const hasOwnProp = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  return hasOwnProp(txParams, "maxFeePerGas") && hasOwnProp(txParams, "maxPriorityFeePerGas");
}
var validateGasValues = (gasValues) => {
  Object.keys(gasValues).forEach((key) => {
    const value = gasValues[key];
    if (typeof value !== "string" || !_utils.isStrictHexString.call(void 0, value)) {
      throw new TypeError(
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `expected hex string for ${key} but received: ${value}`
      );
    }
  });
};
var isFeeMarketEIP1559Values = (gasValues) => gasValues?.maxFeePerGas !== void 0 || gasValues?.maxPriorityFeePerGas !== void 0;
var isGasPriceValue = (gasValues) => gasValues?.gasPrice !== void 0;
var getIncreasedPriceHex = (value, rate) => _utils.add0x.call(void 0, `${parseInt(`${value * rate}`, 10).toString(16)}`);
var getIncreasedPriceFromExisting = (value, rate) => {
  return getIncreasedPriceHex(_controllerutils.convertHexToDecimal.call(void 0, value), rate);
};
function validateMinimumIncrease(proposed, min) {
  const proposedDecimal = _controllerutils.convertHexToDecimal.call(void 0, proposed);
  const minDecimal = _controllerutils.convertHexToDecimal.call(void 0, min);
  if (proposedDecimal >= minDecimal) {
    return proposed;
  }
  const errorMsg = `The proposed value: ${proposedDecimal} should meet or exceed the minimum value: ${minDecimal}`;
  throw new Error(errorMsg);
}
function validateIfTransactionUnapproved(transactionMeta, fnName) {
  if (transactionMeta?.status !== "unapproved" /* unapproved */) {
    throw new Error(
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `TransactionsController: Can only call ${fnName} on an unapproved transaction.
      Current tx status: ${transactionMeta?.status}`
    );
  }
}
function normalizeTxError(error) {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    code: error.code,
    rpc: isJsonCompatible(error.value) ? error.value : void 0
  };
}
function normalizeGasFeeValues(gasFeeValues) {
  const normalize = (value) => typeof value === "string" ? _utils.add0x.call(void 0, value) : value;
  if ("gasPrice" in gasFeeValues) {
    return {
      gasPrice: normalize(gasFeeValues.gasPrice)
    };
  }
  return {
    maxFeePerGas: normalize(gasFeeValues.maxFeePerGas),
    maxPriorityFeePerGas: normalize(gasFeeValues.maxPriorityFeePerGas)
  };
}
function isJsonCompatible(value) {
  try {
    JSON.parse(JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
function padHexToEvenLength(hex) {
  const prefix = hex.toLowerCase().startsWith("0x") ? hex.slice(0, 2) : "";
  const data = prefix ? hex.slice(2) : hex;
  const evenData = data.length % 2 === 0 ? data : `0${data}`;
  return prefix + evenData;
}















exports.ESTIMATE_GAS_ERROR = ESTIMATE_GAS_ERROR; exports.normalizeTransactionParams = normalizeTransactionParams; exports.isEIP1559Transaction = isEIP1559Transaction; exports.validateGasValues = validateGasValues; exports.isFeeMarketEIP1559Values = isFeeMarketEIP1559Values; exports.isGasPriceValue = isGasPriceValue; exports.getIncreasedPriceHex = getIncreasedPriceHex; exports.getIncreasedPriceFromExisting = getIncreasedPriceFromExisting; exports.validateMinimumIncrease = validateMinimumIncrease; exports.validateIfTransactionUnapproved = validateIfTransactionUnapproved; exports.normalizeTxError = normalizeTxError; exports.normalizeGasFeeValues = normalizeGasFeeValues; exports.padHexToEvenLength = padHexToEvenLength;
//# sourceMappingURL=chunk-OZ6UB42C.js.map