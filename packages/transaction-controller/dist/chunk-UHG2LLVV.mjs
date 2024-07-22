import {
  DefaultGasFeeFlow
} from "./chunk-H2KZOK3J.mjs";
import {
  projectLogger
} from "./chunk-UQQWZT6C.mjs";
import {
  GasFeeEstimateLevel
} from "./chunk-6SJYXSF3.mjs";
import {
  __privateAdd,
  __privateMethod
} from "./chunk-XUI43LEZ.mjs";

// src/gas-flows/LineaGasFeeFlow.ts
import { ChainId, hexToBN, query, toHex } from "@metamask/controller-utils";
import { createModuleLogger } from "@metamask/utils";
var log = createModuleLogger(projectLogger, "linea-gas-fee-flow");
var LINEA_CHAIN_IDS = [
  ChainId["linea-mainnet"],
  ChainId["linea-goerli"],
  ChainId["linea-sepolia"]
];
var BASE_FEE_MULTIPLIERS = {
  low: 1,
  medium: 1.35,
  high: 1.7
};
var PRIORITY_FEE_MULTIPLIERS = {
  low: 1,
  medium: 1.05,
  high: 1.1
};
var _getLineaGasFees, getLineaGasFees_fn, _getLineaResponse, getLineaResponse_fn, _getValuesFromMultipliers, getValuesFromMultipliers_fn, _getMaxFees, getMaxFees_fn, _feesToString, feesToString_fn;
var LineaGasFeeFlow = class {
  constructor() {
    __privateAdd(this, _getLineaGasFees);
    __privateAdd(this, _getLineaResponse);
    __privateAdd(this, _getValuesFromMultipliers);
    __privateAdd(this, _getMaxFees);
    __privateAdd(this, _feesToString);
  }
  matchesTransaction(transactionMeta) {
    return LINEA_CHAIN_IDS.includes(transactionMeta.chainId);
  }
  async getGasFees(request) {
    try {
      return await __privateMethod(this, _getLineaGasFees, getLineaGasFees_fn).call(this, request);
    } catch (error) {
      log("Using default flow as fallback due to error", error);
      return new DefaultGasFeeFlow().getGasFees(request);
    }
  }
};
_getLineaGasFees = new WeakSet();
getLineaGasFees_fn = async function(request) {
  const { ethQuery, transactionMeta } = request;
  const lineaResponse = await __privateMethod(this, _getLineaResponse, getLineaResponse_fn).call(this, transactionMeta, ethQuery);
  log("Received Linea response", lineaResponse);
  const baseFees = __privateMethod(this, _getValuesFromMultipliers, getValuesFromMultipliers_fn).call(this, lineaResponse.baseFeePerGas, BASE_FEE_MULTIPLIERS);
  log("Generated base fees", __privateMethod(this, _feesToString, feesToString_fn).call(this, baseFees));
  const priorityFees = __privateMethod(this, _getValuesFromMultipliers, getValuesFromMultipliers_fn).call(this, lineaResponse.priorityFeePerGas, PRIORITY_FEE_MULTIPLIERS);
  log("Generated priority fees", __privateMethod(this, _feesToString, feesToString_fn).call(this, priorityFees));
  const maxFees = __privateMethod(this, _getMaxFees, getMaxFees_fn).call(this, baseFees, priorityFees);
  log("Generated max fees", __privateMethod(this, _feesToString, feesToString_fn).call(this, maxFees));
  const estimates = Object.values(GasFeeEstimateLevel).reduce(
    (result, level) => ({
      ...result,
      [level]: {
        maxFeePerGas: toHex(maxFees[level]),
        maxPriorityFeePerGas: toHex(priorityFees[level])
      }
    }),
    { type: "fee-market" /* FeeMarket */ }
  );
  return { estimates };
};
_getLineaResponse = new WeakSet();
getLineaResponse_fn = function(transactionMeta, ethQuery) {
  return query(ethQuery, "linea_estimateGas", [
    {
      from: transactionMeta.txParams.from,
      to: transactionMeta.txParams.to,
      value: transactionMeta.txParams.value,
      input: transactionMeta.txParams.data,
      // Required in request but no impact on response.
      gasPrice: "0x100000000"
    }
  ]);
};
_getValuesFromMultipliers = new WeakSet();
getValuesFromMultipliers_fn = function(value, multipliers) {
  const base = hexToBN(value);
  const low = base.muln(multipliers.low);
  const medium = base.muln(multipliers.medium);
  const high = base.muln(multipliers.high);
  return {
    low,
    medium,
    high
  };
};
_getMaxFees = new WeakSet();
getMaxFees_fn = function(baseFees, priorityFees) {
  return {
    low: baseFees.low.add(priorityFees.low),
    medium: baseFees.medium.add(priorityFees.medium),
    high: baseFees.high.add(priorityFees.high)
  };
};
_feesToString = new WeakSet();
feesToString_fn = function(fees) {
  return Object.values(GasFeeEstimateLevel).map(
    (level) => fees[level].toString(10)
  );
};

export {
  LineaGasFeeFlow
};
//# sourceMappingURL=chunk-UHG2LLVV.mjs.map