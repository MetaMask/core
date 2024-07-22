"use strict";Object.defineProperty(exports, "__esModule", {value: true});

var _chunkC3WC4OJ3js = require('./chunk-C3WC4OJ3.js');


var _chunkS6VGOPUYjs = require('./chunk-S6VGOPUY.js');


var _chunkAYTU4HU5js = require('./chunk-AYTU4HU5.js');



var _chunkZ4BLTVTBjs = require('./chunk-Z4BLTVTB.js');

// src/gas-flows/DefaultGasFeeFlow.ts
var _gasfeecontroller = require('@metamask/gas-fee-controller');
var _utils = require('@metamask/utils');
var log = _utils.createModuleLogger.call(void 0, _chunkS6VGOPUYjs.projectLogger, "default-gas-fee-flow");
var _getFeeMarkEstimates, getFeeMarkEstimates_fn, _getLegacyEstimates, getLegacyEstimates_fn, _getGasPriceEstimates, getGasPriceEstimates_fn, _getFeeMarketLevel, getFeeMarketLevel_fn, _getLegacyLevel, getLegacyLevel_fn;
var DefaultGasFeeFlow = class {
  constructor() {
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getFeeMarkEstimates);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getLegacyEstimates);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getGasPriceEstimates);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getFeeMarketLevel);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getLegacyLevel);
  }
  matchesTransaction(_transactionMeta) {
    return true;
  }
  async getGasFees(request) {
    const { gasFeeControllerData } = request;
    const { gasEstimateType, gasFeeEstimates } = gasFeeControllerData;
    let response;
    switch (gasEstimateType) {
      case _gasfeecontroller.GAS_ESTIMATE_TYPES.FEE_MARKET:
        log("Using fee market estimates", gasFeeEstimates);
        response = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getFeeMarkEstimates, getFeeMarkEstimates_fn).call(this, gasFeeEstimates);
        break;
      case _gasfeecontroller.GAS_ESTIMATE_TYPES.LEGACY:
        log("Using legacy estimates", gasFeeEstimates);
        response = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getLegacyEstimates, getLegacyEstimates_fn).call(this, gasFeeEstimates);
        break;
      case _gasfeecontroller.GAS_ESTIMATE_TYPES.ETH_GASPRICE:
        log("Using eth_gasPrice estimates", gasFeeEstimates);
        response = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getGasPriceEstimates, getGasPriceEstimates_fn).call(this, gasFeeEstimates);
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
  const levels = Object.values(_chunkAYTU4HU5js.GasFeeEstimateLevel).reduce(
    (result, level) => ({
      ...result,
      [level]: _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getFeeMarketLevel, getFeeMarketLevel_fn).call(this, gasFeeEstimates, level)
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
  const levels = Object.values(_chunkAYTU4HU5js.GasFeeEstimateLevel).reduce(
    (result, level) => ({
      ...result,
      [level]: _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getLegacyLevel, getLegacyLevel_fn).call(this, gasFeeEstimates, level)
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
    gasPrice: _chunkC3WC4OJ3js.gweiDecimalToWeiHex.call(void 0, gasFeeEstimates.gasPrice)
  };
};
_getFeeMarketLevel = new WeakSet();
getFeeMarketLevel_fn = function(gasFeeEstimates, level) {
  const maxFeePerGas = _chunkC3WC4OJ3js.gweiDecimalToWeiHex.call(void 0, 
    gasFeeEstimates[level].suggestedMaxFeePerGas
  );
  const maxPriorityFeePerGas = _chunkC3WC4OJ3js.gweiDecimalToWeiHex.call(void 0, 
    gasFeeEstimates[level].suggestedMaxPriorityFeePerGas
  );
  return {
    maxFeePerGas,
    maxPriorityFeePerGas
  };
};
_getLegacyLevel = new WeakSet();
getLegacyLevel_fn = function(gasFeeEstimates, level) {
  return _chunkC3WC4OJ3js.gweiDecimalToWeiHex.call(void 0, gasFeeEstimates[level]);
};



exports.DefaultGasFeeFlow = DefaultGasFeeFlow;
//# sourceMappingURL=chunk-QTKXIDGE.js.map