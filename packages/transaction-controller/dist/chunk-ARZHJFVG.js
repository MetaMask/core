"use strict";Object.defineProperty(exports, "__esModule", {value: true});

var _chunkQTKXIDGEjs = require('./chunk-QTKXIDGE.js');


var _chunkS6VGOPUYjs = require('./chunk-S6VGOPUY.js');


var _chunkAYTU4HU5js = require('./chunk-AYTU4HU5.js');



var _chunkZ4BLTVTBjs = require('./chunk-Z4BLTVTB.js');

// src/gas-flows/LineaGasFeeFlow.ts
var _controllerutils = require('@metamask/controller-utils');
var _utils = require('@metamask/utils');
var log = _utils.createModuleLogger.call(void 0, _chunkS6VGOPUYjs.projectLogger, "linea-gas-fee-flow");
var LINEA_CHAIN_IDS = [
  _controllerutils.ChainId["linea-mainnet"],
  _controllerutils.ChainId["linea-goerli"],
  _controllerutils.ChainId["linea-sepolia"]
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
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getLineaGasFees);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getLineaResponse);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getValuesFromMultipliers);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getMaxFees);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _feesToString);
  }
  matchesTransaction(transactionMeta) {
    return LINEA_CHAIN_IDS.includes(transactionMeta.chainId);
  }
  async getGasFees(request) {
    try {
      return await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getLineaGasFees, getLineaGasFees_fn).call(this, request);
    } catch (error) {
      log("Using default flow as fallback due to error", error);
      return new (0, _chunkQTKXIDGEjs.DefaultGasFeeFlow)().getGasFees(request);
    }
  }
};
_getLineaGasFees = new WeakSet();
getLineaGasFees_fn = async function(request) {
  const { ethQuery, transactionMeta } = request;
  const lineaResponse = await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getLineaResponse, getLineaResponse_fn).call(this, transactionMeta, ethQuery);
  log("Received Linea response", lineaResponse);
  const baseFees = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getValuesFromMultipliers, getValuesFromMultipliers_fn).call(this, lineaResponse.baseFeePerGas, BASE_FEE_MULTIPLIERS);
  log("Generated base fees", _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _feesToString, feesToString_fn).call(this, baseFees));
  const priorityFees = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getValuesFromMultipliers, getValuesFromMultipliers_fn).call(this, lineaResponse.priorityFeePerGas, PRIORITY_FEE_MULTIPLIERS);
  log("Generated priority fees", _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _feesToString, feesToString_fn).call(this, priorityFees));
  const maxFees = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getMaxFees, getMaxFees_fn).call(this, baseFees, priorityFees);
  log("Generated max fees", _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _feesToString, feesToString_fn).call(this, maxFees));
  const estimates = Object.values(_chunkAYTU4HU5js.GasFeeEstimateLevel).reduce(
    (result, level) => ({
      ...result,
      [level]: {
        maxFeePerGas: _controllerutils.toHex.call(void 0, maxFees[level]),
        maxPriorityFeePerGas: _controllerutils.toHex.call(void 0, priorityFees[level])
      }
    }),
    { type: "fee-market" /* FeeMarket */ }
  );
  return { estimates };
};
_getLineaResponse = new WeakSet();
getLineaResponse_fn = function(transactionMeta, ethQuery) {
  return _controllerutils.query.call(void 0, ethQuery, "linea_estimateGas", [
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
  const base = _controllerutils.hexToBN.call(void 0, value);
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
  return Object.values(_chunkAYTU4HU5js.GasFeeEstimateLevel).map(
    (level) => fees[level].toString(10)
  );
};



exports.LineaGasFeeFlow = LineaGasFeeFlow;
//# sourceMappingURL=chunk-ARZHJFVG.js.map