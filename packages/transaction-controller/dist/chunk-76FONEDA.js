"use strict";Object.defineProperty(exports, "__esModule", {value: true});

var _chunkAYTU4HU5js = require('./chunk-AYTU4HU5.js');

// src/utils/gas-flow.ts
var _controllerutils = require('@metamask/controller-utils');
function getGasFeeFlow(transactionMeta, gasFeeFlows) {
  return gasFeeFlows.find(
    (gasFeeFlow) => gasFeeFlow.matchesTransaction(transactionMeta)
  );
}
function mergeGasFeeEstimates({
  gasFeeControllerEstimates,
  transactionGasFeeEstimates
}) {
  const transactionEstimateType = transactionGasFeeEstimates.type;
  if (transactionEstimateType === "fee-market" /* FeeMarket */) {
    return Object.values(_chunkAYTU4HU5js.GasFeeEstimateLevel).reduce(
      (result, level) => ({
        ...result,
        [level]: mergeFeeMarketEstimate(
          gasFeeControllerEstimates?.[level],
          transactionGasFeeEstimates[level]
        )
      }),
      { ...gasFeeControllerEstimates }
    );
  }
  if (transactionEstimateType === "legacy" /* Legacy */) {
    return Object.values(_chunkAYTU4HU5js.GasFeeEstimateLevel).reduce(
      (result, level) => ({
        ...result,
        [level]: getLegacyEstimate(transactionGasFeeEstimates, level)
      }),
      {}
    );
  }
  if (transactionEstimateType === "eth_gasPrice" /* GasPrice */) {
    return {
      gasPrice: getGasPriceEstimate(transactionGasFeeEstimates)
    };
  }
  return gasFeeControllerEstimates;
}
function mergeFeeMarketEstimate(gasFeeControllerEstimate, transactionGasFeeEstimate) {
  return {
    ...gasFeeControllerEstimate,
    suggestedMaxFeePerGas: _controllerutils.weiHexToGweiDec.call(void 0, 
      transactionGasFeeEstimate.maxFeePerGas
    ),
    suggestedMaxPriorityFeePerGas: _controllerutils.weiHexToGweiDec.call(void 0, 
      transactionGasFeeEstimate.maxPriorityFeePerGas
    )
  };
}
function getLegacyEstimate(transactionGasFeeEstimate, level) {
  return _controllerutils.weiHexToGweiDec.call(void 0, transactionGasFeeEstimate[level]);
}
function getGasPriceEstimate(transactionGasFeeEstimate) {
  return _controllerutils.weiHexToGweiDec.call(void 0, transactionGasFeeEstimate.gasPrice);
}




exports.getGasFeeFlow = getGasFeeFlow; exports.mergeGasFeeEstimates = mergeGasFeeEstimates;
//# sourceMappingURL=chunk-76FONEDA.js.map