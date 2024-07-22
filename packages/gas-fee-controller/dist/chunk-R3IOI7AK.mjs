var __accessCheck = (obj, member, msg) => {
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
import {
  query,
  handleFetch,
  gweiDecToWEIBN,
  weiHexToGweiDec
} from "@metamask/controller-utils";
import BN from "bn.js";
var makeClientIdHeader = (clientId) => ({ "X-Client-Id": clientId });
function normalizeGWEIDecimalNumbers(n) {
  const numberAsWEIHex = gweiDecToWEIBN(n).toString(16);
  const numberAsGWEI = weiHexToGweiDec(numberAsWEIHex);
  return numberAsGWEI;
}
async function fetchGasEstimates(url, clientId) {
  const estimates = await handleFetch(
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
  const result = await handleFetch(url, {
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
  const gasPrice = await query(ethQuery, "gasPrice");
  return {
    gasPrice: weiHexToGweiDec(gasPrice).toString()
  };
}
function calculateTimeEstimate(maxPriorityFeePerGas, maxFeePerGas, gasFeeEstimates) {
  const { low, medium, high, estimatedBaseFee } = gasFeeEstimates;
  const maxPriorityFeePerGasInWEI = gweiDecToWEIBN(maxPriorityFeePerGas);
  const maxFeePerGasInWEI = gweiDecToWEIBN(maxFeePerGas);
  const estimatedBaseFeeInWEI = gweiDecToWEIBN(estimatedBaseFee);
  const effectiveMaxPriorityFee = BN.min(
    maxPriorityFeePerGasInWEI,
    maxFeePerGasInWEI.sub(estimatedBaseFeeInWEI)
  );
  const lowMaxPriorityFeeInWEI = gweiDecToWEIBN(
    low.suggestedMaxPriorityFeePerGas
  );
  const mediumMaxPriorityFeeInWEI = gweiDecToWEIBN(
    medium.suggestedMaxPriorityFeePerGas
  );
  const highMaxPriorityFeeInWEI = gweiDecToWEIBN(
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

export {
  __privateGet,
  __privateAdd,
  __privateSet,
  __privateMethod,
  normalizeGWEIDecimalNumbers,
  fetchGasEstimates,
  fetchLegacyGasPriceEstimates,
  fetchEthGasPriceEstimate,
  calculateTimeEstimate
};
//# sourceMappingURL=chunk-R3IOI7AK.mjs.map