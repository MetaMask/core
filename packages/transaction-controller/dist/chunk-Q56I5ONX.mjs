// src/utils/utils.ts
import { convertHexToDecimal } from "@metamask/controller-utils";
import {
  add0x,
  getKnownPropertyNames,
  isStrictHexString
} from "@metamask/utils";
var ESTIMATE_GAS_ERROR = "eth_estimateGas rpc method error";
var NORMALIZERS = {
  data: (data) => add0x(padHexToEvenLength(data)),
  from: (from) => add0x(from).toLowerCase(),
  gas: (gas) => add0x(gas),
  gasLimit: (gas) => add0x(gas),
  gasPrice: (gasPrice) => add0x(gasPrice),
  nonce: (nonce) => add0x(nonce),
  to: (to) => add0x(to).toLowerCase(),
  value: (value) => add0x(value),
  maxFeePerGas: (maxFeePerGas) => add0x(maxFeePerGas),
  maxPriorityFeePerGas: (maxPriorityFeePerGas) => add0x(maxPriorityFeePerGas),
  estimatedBaseFee: (maxPriorityFeePerGas) => add0x(maxPriorityFeePerGas),
  type: (type) => add0x(type)
};
function normalizeTransactionParams(txParams) {
  const normalizedTxParams = { from: "" };
  for (const key of getKnownPropertyNames(NORMALIZERS)) {
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
    if (typeof value !== "string" || !isStrictHexString(value)) {
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
var getIncreasedPriceHex = (value, rate) => add0x(`${parseInt(`${value * rate}`, 10).toString(16)}`);
var getIncreasedPriceFromExisting = (value, rate) => {
  return getIncreasedPriceHex(convertHexToDecimal(value), rate);
};
function validateMinimumIncrease(proposed, min) {
  const proposedDecimal = convertHexToDecimal(proposed);
  const minDecimal = convertHexToDecimal(min);
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
  const normalize = (value) => typeof value === "string" ? add0x(value) : value;
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

export {
  ESTIMATE_GAS_ERROR,
  normalizeTransactionParams,
  isEIP1559Transaction,
  validateGasValues,
  isFeeMarketEIP1559Values,
  isGasPriceValue,
  getIncreasedPriceHex,
  getIncreasedPriceFromExisting,
  validateMinimumIncrease,
  validateIfTransactionUnapproved,
  normalizeTxError,
  normalizeGasFeeValues,
  padHexToEvenLength
};
//# sourceMappingURL=chunk-Q56I5ONX.mjs.map