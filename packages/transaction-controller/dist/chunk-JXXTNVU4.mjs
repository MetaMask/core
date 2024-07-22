import {
  GasFeeEstimateLevel
} from "./chunk-6SJYXSF3.mjs";

// src/utils/gas-flow.ts
import { weiHexToGweiDec } from "@metamask/controller-utils";
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
    return Object.values(GasFeeEstimateLevel).reduce(
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
    return Object.values(GasFeeEstimateLevel).reduce(
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
    suggestedMaxFeePerGas: weiHexToGweiDec(
      transactionGasFeeEstimate.maxFeePerGas
    ),
    suggestedMaxPriorityFeePerGas: weiHexToGweiDec(
      transactionGasFeeEstimate.maxPriorityFeePerGas
    )
  };
}
function getLegacyEstimate(transactionGasFeeEstimate, level) {
  return weiHexToGweiDec(transactionGasFeeEstimate[level]);
}
function getGasPriceEstimate(transactionGasFeeEstimate) {
  return weiHexToGweiDec(transactionGasFeeEstimate.gasPrice);
}

export {
  getGasFeeFlow,
  mergeGasFeeEstimates
};
//# sourceMappingURL=chunk-JXXTNVU4.mjs.map