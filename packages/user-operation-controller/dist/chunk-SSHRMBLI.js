"use strict";Object.defineProperty(exports, "__esModule", {value: true}); function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }


var _chunkKQMYR73Xjs = require('./chunk-KQMYR73X.js');


var _chunkBTR56Y3Fjs = require('./chunk-BTR56Y3F.js');

// src/utils/gas-fees.ts





var _controllerutils = require('@metamask/controller-utils');
var _ethquery = require('@metamask/eth-query'); var _ethquery2 = _interopRequireDefault(_ethquery);


var _gasfeecontroller = require('@metamask/gas-fee-controller');
var _transactioncontroller = require('@metamask/transaction-controller');
var _utils = require('@metamask/utils');
var log = _chunkKQMYR73Xjs.createModuleLogger.call(void 0, _chunkKQMYR73Xjs.projectLogger, "gas-fees");
async function updateGasFees(request) {
  const { metadata, originalRequest, transaction } = request;
  const { userOperation } = metadata;
  let suggestedGasFees;
  const getGasFeeEstimates = async () => {
    if (!suggestedGasFees) {
      suggestedGasFees = await getSuggestedGasFees(request);
    }
    return suggestedGasFees;
  };
  userOperation.maxFeePerGas = await getMaxFeePerGas(
    originalRequest,
    getGasFeeEstimates,
    transaction
  );
  userOperation.maxPriorityFeePerGas = await getMaxPriorityFeePerGas(
    originalRequest,
    getGasFeeEstimates,
    userOperation,
    transaction
  );
  metadata.userFeeLevel = getUserFeeLevel(
    metadata,
    originalRequest,
    suggestedGasFees,
    transaction
  );
}
async function getMaxFeePerGas(originalRequest, getGetFasEstimates, transaction) {
  const { maxFeePerGas, maxPriorityFeePerGas } = originalRequest;
  const { gasPrice } = transaction ?? {};
  if (!isGasFeeEmpty(maxFeePerGas)) {
    log("Using maxFeePerGas from request", maxFeePerGas);
    return maxFeePerGas;
  }
  if (isGasFeeEmpty(maxPriorityFeePerGas) && gasPrice) {
    log("Setting maxFeePerGas to transaction gasPrice", gasPrice);
    return gasPrice;
  }
  const { maxFeePerGas: suggestedMaxFeePerGas } = await getGetFasEstimates();
  if (!suggestedMaxFeePerGas) {
    throw new Error("Failed to get gas fee estimate for maxFeePerGas");
  }
  log("Using maxFeePerGas from estimate", suggestedMaxFeePerGas);
  return suggestedMaxFeePerGas;
}
async function getMaxPriorityFeePerGas(originalRequest, getGetFasEstimates, userOperation, transaction) {
  const { maxFeePerGas, maxPriorityFeePerGas } = originalRequest;
  const { gasPrice } = transaction ?? {};
  const { maxFeePerGas: updatedMaxFeePerGas } = userOperation;
  if (!isGasFeeEmpty(maxPriorityFeePerGas)) {
    log("Using maxPriorityFeePerGas from request", maxPriorityFeePerGas);
    return maxPriorityFeePerGas;
  }
  if (isGasFeeEmpty(maxFeePerGas) && gasPrice) {
    log("Setting maxPriorityFeePerGas to transaction gasPrice", gasPrice);
    return gasPrice;
  }
  const { maxPriorityFeePerGas: suggestedMaxPriorityFeePerGas } = await getGetFasEstimates();
  if (suggestedMaxPriorityFeePerGas) {
    log(
      "Using maxPriorityFeePerGas from estimate",
      suggestedMaxPriorityFeePerGas
    );
    return suggestedMaxPriorityFeePerGas;
  }
  log("Setting maxPriorityFeePerGas to maxFeePerGas", updatedMaxFeePerGas);
  return updatedMaxFeePerGas;
}
function getUserFeeLevel(metadata, originalRequest, suggestedGasFees, transaction) {
  const { origin } = metadata;
  const { maxFeePerGas, maxPriorityFeePerGas } = originalRequest;
  const {
    maxFeePerGas: suggestedMaxFeePerGas,
    maxPriorityFeePerGas: suggestedMaxPriorityFeePerGas
  } = suggestedGasFees || {};
  if (isGasFeeEmpty(maxFeePerGas) && isGasFeeEmpty(maxPriorityFeePerGas) && transaction?.gasPrice) {
    return origin === _controllerutils.ORIGIN_METAMASK ? _transactioncontroller.UserFeeLevel.CUSTOM : _transactioncontroller.UserFeeLevel.DAPP_SUGGESTED;
  }
  if (isGasFeeEmpty(maxFeePerGas) && isGasFeeEmpty(maxPriorityFeePerGas) && suggestedMaxFeePerGas && suggestedMaxPriorityFeePerGas) {
    return _transactioncontroller.UserFeeLevel.MEDIUM;
  }
  if (origin === _controllerutils.ORIGIN_METAMASK) {
    return _transactioncontroller.UserFeeLevel.CUSTOM;
  }
  return _transactioncontroller.UserFeeLevel.DAPP_SUGGESTED;
}
async function getSuggestedGasFees(request) {
  const { getGasFeeEstimates, provider } = request;
  try {
    const { gasFeeEstimates, gasEstimateType } = await getGasFeeEstimates();
    if (gasEstimateType === _gasfeecontroller.GAS_ESTIMATE_TYPES.FEE_MARKET) {
      const {
        medium: { suggestedMaxPriorityFeePerGas, suggestedMaxFeePerGas } = {}
      } = gasFeeEstimates;
      if (suggestedMaxPriorityFeePerGas && suggestedMaxFeePerGas) {
        const values = {
          maxFeePerGas: gweiDecimalToWeiHex(suggestedMaxFeePerGas),
          maxPriorityFeePerGas: gweiDecimalToWeiHex(
            suggestedMaxPriorityFeePerGas
          )
        };
        log("Using medium values from fee market estimate", values);
        return values;
      }
    }
    if (gasEstimateType === _gasfeecontroller.GAS_ESTIMATE_TYPES.LEGACY) {
      const maxFeePerGas2 = gweiDecimalToWeiHex(gasFeeEstimates.medium);
      log("Using medium value from legacy estimate", maxFeePerGas2);
      return {
        maxFeePerGas: maxFeePerGas2
      };
    }
    if (gasEstimateType === _gasfeecontroller.GAS_ESTIMATE_TYPES.ETH_GASPRICE) {
      const maxFeePerGas2 = gweiDecimalToWeiHex(gasFeeEstimates.gasPrice);
      log("Using gasPrice from estimate", maxFeePerGas2);
      return {
        maxFeePerGas: maxFeePerGas2
      };
    }
  } catch (error) {
    log("Failed to get estimate", error);
  }
  const gasPriceDecimal = await _controllerutils.query.call(void 0, new (0, _ethquery2.default)(provider), "gasPrice");
  if (!gasPriceDecimal) {
    return {};
  }
  const maxFeePerGas = _utils.add0x.call(void 0, gasPriceDecimal.toString(16));
  log("Using gasPrice from network as fallback", maxFeePerGas);
  return { maxFeePerGas };
}
function gweiDecimalToWeiHex(value) {
  return _controllerutils.toHex.call(void 0, _controllerutils.gweiDecToWEIBN.call(void 0, value));
}
function isGasFeeEmpty(value) {
  return !value || value === _chunkBTR56Y3Fjs.EMPTY_BYTES;
}



exports.updateGasFees = updateGasFees;
//# sourceMappingURL=chunk-SSHRMBLI.js.map