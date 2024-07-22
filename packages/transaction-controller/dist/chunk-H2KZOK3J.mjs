import {
  gweiDecimalToWeiHex
} from "./chunk-VXNPVIYL.mjs";
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

// src/gas-flows/DefaultGasFeeFlow.ts
import { GAS_ESTIMATE_TYPES } from "@metamask/gas-fee-controller";
import { createModuleLogger } from "@metamask/utils";
var log = createModuleLogger(projectLogger, "default-gas-fee-flow");
var _getFeeMarkEstimates, getFeeMarkEstimates_fn, _getLegacyEstimates, getLegacyEstimates_fn, _getGasPriceEstimates, getGasPriceEstimates_fn, _getFeeMarketLevel, getFeeMarketLevel_fn, _getLegacyLevel, getLegacyLevel_fn;
var DefaultGasFeeFlow = class {
  constructor() {
    __privateAdd(this, _getFeeMarkEstimates);
    __privateAdd(this, _getLegacyEstimates);
    __privateAdd(this, _getGasPriceEstimates);
    __privateAdd(this, _getFeeMarketLevel);
    __privateAdd(this, _getLegacyLevel);
  }
  matchesTransaction(_transactionMeta) {
    return true;
  }
  async getGasFees(request) {
    const { gasFeeControllerData } = request;
    const { gasEstimateType, gasFeeEstimates } = gasFeeControllerData;
    let response;
    switch (gasEstimateType) {
      case GAS_ESTIMATE_TYPES.FEE_MARKET:
        log("Using fee market estimates", gasFeeEstimates);
        response = __privateMethod(this, _getFeeMarkEstimates, getFeeMarkEstimates_fn).call(this, gasFeeEstimates);
        break;
      case GAS_ESTIMATE_TYPES.LEGACY:
        log("Using legacy estimates", gasFeeEstimates);
        response = __privateMethod(this, _getLegacyEstimates, getLegacyEstimates_fn).call(this, gasFeeEstimates);
        break;
      case GAS_ESTIMATE_TYPES.ETH_GASPRICE:
        log("Using eth_gasPrice estimates", gasFeeEstimates);
        response = __privateMethod(this, _getGasPriceEstimates, getGasPriceEstimates_fn).call(this, gasFeeEstimates);
        break;
      default:
        throw new Error(`Unsupported gas estimate type: ${gasEstimateType}`);
    }
    return {
      estimates: response
    };
  }
};
_getFeeMarkEstimates = new WeakSet();
getFeeMarkEstimates_fn = function(gasFeeEstimates) {
  const levels = Object.values(GasFeeEstimateLevel).reduce(
    (result, level) => ({
      ...result,
      [level]: __privateMethod(this, _getFeeMarketLevel, getFeeMarketLevel_fn).call(this, gasFeeEstimates, level)
    }),
    {}
  );
  return {
    type: "fee-market" /* FeeMarket */,
    ...levels
  };
};
_getLegacyEstimates = new WeakSet();
getLegacyEstimates_fn = function(gasFeeEstimates) {
  const levels = Object.values(GasFeeEstimateLevel).reduce(
    (result, level) => ({
      ...result,
      [level]: __privateMethod(this, _getLegacyLevel, getLegacyLevel_fn).call(this, gasFeeEstimates, level)
    }),
    {}
  );
  return {
    type: "legacy" /* Legacy */,
    ...levels
  };
};
_getGasPriceEstimates = new WeakSet();
getGasPriceEstimates_fn = function(gasFeeEstimates) {
  return {
    type: "eth_gasPrice" /* GasPrice */,
    gasPrice: gweiDecimalToWeiHex(gasFeeEstimates.gasPrice)
  };
};
_getFeeMarketLevel = new WeakSet();
getFeeMarketLevel_fn = function(gasFeeEstimates, level) {
  const maxFeePerGas = gweiDecimalToWeiHex(
    gasFeeEstimates[level].suggestedMaxFeePerGas
  );
  const maxPriorityFeePerGas = gweiDecimalToWeiHex(
    gasFeeEstimates[level].suggestedMaxPriorityFeePerGas
  );
  return {
    maxFeePerGas,
    maxPriorityFeePerGas
  };
};
_getLegacyLevel = new WeakSet();
getLegacyLevel_fn = function(gasFeeEstimates, level) {
  return gweiDecimalToWeiHex(gasFeeEstimates[level]);
};

export {
  DefaultGasFeeFlow
};
//# sourceMappingURL=chunk-H2KZOK3J.mjs.map