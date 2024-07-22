"use strict";Object.defineProperty(exports, "__esModule", {value: true}); function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }var __accessCheck = (obj, member, msg) => {
  if (!member.has(obj))
    throw TypeError("Cannot " + msg);
};
var __privateGet = (obj, member, getter) => {
  __accessCheck(obj, member, "read from private field");
  return getter ? getter.call(obj) : member.get(obj);
};
var __privateAdd = (obj, member, value) => {
  if (member.has(obj))
    throw TypeError("Cannot add the same private member more than once");
  member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
};
var __privateSet = (obj, member, value, setter) => {
  __accessCheck(obj, member, "write to private field");
  setter ? setter.call(obj, value) : member.set(obj, value);
  return value;
};
var __privateMethod = (obj, member, method) => {
  __accessCheck(obj, member, "access private method");
  return method;
};

// src/gas-util.ts





var _controllerutils = require('@metamask/controller-utils');
var _bnjs = require('bn.js'); var _bnjs2 = _interopRequireDefault(_bnjs);
var makeClientIdHeader = (clientId) => ({ "X-Client-Id": clientId });
function normalizeGWEIDecimalNumbers(n) {
  const numberAsWEIHex = _controllerutils.gweiDecToWEIBN.call(void 0, n).toString(16);
  const numberAsGWEI = _controllerutils.weiHexToGweiDec.call(void 0, numberAsWEIHex);
  return numberAsGWEI;
}
async function fetchGasEstimates(url, clientId) {
  const estimates = await _controllerutils.handleFetch.call(void 0, 
    url,
    clientId ? { headers: makeClientIdHeader(clientId) } : void 0
  );
  return {
    low: {
      ...estimates.low,
      suggestedMaxPriorityFeePerGas: normalizeGWEIDecimalNumbers(
        estimates.low.suggestedMaxPriorityFeePerGas
      ),
      suggestedMaxFeePerGas: normalizeGWEIDecimalNumbers(
        estimates.low.suggestedMaxFeePerGas
      )
    },
    medium: {
      ...estimates.medium,
      suggestedMaxPriorityFeePerGas: normalizeGWEIDecimalNumbers(
        estimates.medium.suggestedMaxPriorityFeePerGas
      ),
      suggestedMaxFeePerGas: normalizeGWEIDecimalNumbers(
        estimates.medium.suggestedMaxFeePerGas
      )
    },
    high: {
      ...estimates.high,
      suggestedMaxPriorityFeePerGas: normalizeGWEIDecimalNumbers(
        estimates.high.suggestedMaxPriorityFeePerGas
      ),
      suggestedMaxFeePerGas: normalizeGWEIDecimalNumbers(
        estimates.high.suggestedMaxFeePerGas
      )
    },
    estimatedBaseFee: normalizeGWEIDecimalNumbers(estimates.estimatedBaseFee),
    historicalBaseFeeRange: estimates.historicalBaseFeeRange,
    baseFeeTrend: estimates.baseFeeTrend,
    latestPriorityFeeRange: estimates.latestPriorityFeeRange,
    historicalPriorityFeeRange: estimates.historicalPriorityFeeRange,
    priorityFeeTrend: estimates.priorityFeeTrend,
    networkCongestion: estimates.networkCongestion
  };
}
async function fetchLegacyGasPriceEstimates(url, clientId) {
  const result = await _controllerutils.handleFetch.call(void 0, url, {
    referrer: url,
    referrerPolicy: "no-referrer-when-downgrade",
    method: "GET",
    mode: "cors",
    headers: {
      "Content-Type": "application/json",
      ...clientId && makeClientIdHeader(clientId)
    }
  });
  return {
    low: result.SafeGasPrice,
    medium: result.ProposeGasPrice,
    high: result.FastGasPrice
  };
}
async function fetchEthGasPriceEstimate(ethQuery) {
  const gasPrice = await _controllerutils.query.call(void 0, ethQuery, "gasPrice");
  return {
    gasPrice: _controllerutils.weiHexToGweiDec.call(void 0, gasPrice).toString()
  };
}
function calculateTimeEstimate(maxPriorityFeePerGas, maxFeePerGas, gasFeeEstimates) {
  const { low, medium, high, estimatedBaseFee } = gasFeeEstimates;
  const maxPriorityFeePerGasInWEI = _controllerutils.gweiDecToWEIBN.call(void 0, maxPriorityFeePerGas);
  const maxFeePerGasInWEI = _controllerutils.gweiDecToWEIBN.call(void 0, maxFeePerGas);
  const estimatedBaseFeeInWEI = _controllerutils.gweiDecToWEIBN.call(void 0, estimatedBaseFee);
  const effectiveMaxPriorityFee = _bnjs2.default.min(
    maxPriorityFeePerGasInWEI,
    maxFeePerGasInWEI.sub(estimatedBaseFeeInWEI)
  );
  const lowMaxPriorityFeeInWEI = _controllerutils.gweiDecToWEIBN.call(void 0, 
    low.suggestedMaxPriorityFeePerGas
  );
  const mediumMaxPriorityFeeInWEI = _controllerutils.gweiDecToWEIBN.call(void 0, 
    medium.suggestedMaxPriorityFeePerGas
  );
  const highMaxPriorityFeeInWEI = _controllerutils.gweiDecToWEIBN.call(void 0, 
    high.suggestedMaxPriorityFeePerGas
  );
  let lowerTimeBound;
  let upperTimeBound;
  if (effectiveMaxPriorityFee.lt(lowMaxPriorityFeeInWEI)) {
    lowerTimeBound = null;
    upperTimeBound = "unknown";
  } else if (effectiveMaxPriorityFee.gte(lowMaxPriorityFeeInWEI) && effectiveMaxPriorityFee.lt(mediumMaxPriorityFeeInWEI)) {
    lowerTimeBound = low.minWaitTimeEstimate;
    upperTimeBound = low.maxWaitTimeEstimate;
  } else if (effectiveMaxPriorityFee.gte(mediumMaxPriorityFeeInWEI) && effectiveMaxPriorityFee.lt(highMaxPriorityFeeInWEI)) {
    lowerTimeBound = medium.minWaitTimeEstimate;
    upperTimeBound = medium.maxWaitTimeEstimate;
  } else if (effectiveMaxPriorityFee.eq(highMaxPriorityFeeInWEI)) {
    lowerTimeBound = high.minWaitTimeEstimate;
    upperTimeBound = high.maxWaitTimeEstimate;
  } else {
    lowerTimeBound = 0;
    upperTimeBound = high.maxWaitTimeEstimate;
  }
  return {
    lowerTimeBound,
    upperTimeBound
  };
}











exports.__privateGet = __privateGet; exports.__privateAdd = __privateAdd; exports.__privateSet = __privateSet; exports.__privateMethod = __privateMethod; exports.normalizeGWEIDecimalNumbers = normalizeGWEIDecimalNumbers; exports.fetchGasEstimates = fetchGasEstimates; exports.fetchLegacyGasPriceEstimates = fetchLegacyGasPriceEstimates; exports.fetchEthGasPriceEstimate = fetchEthGasPriceEstimate; exports.calculateTimeEstimate = calculateTimeEstimate;
//# sourceMappingURL=chunk-2MFVV2BX.js.map