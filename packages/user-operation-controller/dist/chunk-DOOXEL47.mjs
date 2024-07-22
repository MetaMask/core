import {
  createModuleLogger,
  projectLogger
} from "./chunk-DKF5XCNY.mjs";
import {
  EMPTY_BYTES
} from "./chunk-TPPISKNS.mjs";

// src/utils/gas-fees.ts
import {
  gweiDecToWEIBN,
  ORIGIN_METAMASK,
  query,
  toHex
} from "@metamask/controller-utils";
import EthQuery from "@metamask/eth-query";
import {
  GAS_ESTIMATE_TYPES
} from "@metamask/gas-fee-controller";
import { UserFeeLevel } from "@metamask/transaction-controller";
import { add0x } from "@metamask/utils";
var log = createModuleLogger(projectLogger, "gas-fees");
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
    return origin === ORIGIN_METAMASK ? UserFeeLevel.CUSTOM : UserFeeLevel.DAPP_SUGGESTED;
  }
  if (isGasFeeEmpty(maxFeePerGas) && isGasFeeEmpty(maxPriorityFeePerGas) && suggestedMaxFeePerGas && suggestedMaxPriorityFeePerGas) {
    return UserFeeLevel.MEDIUM;
  }
  if (origin === ORIGIN_METAMASK) {
    return UserFeeLevel.CUSTOM;
  }
  return UserFeeLevel.DAPP_SUGGESTED;
}
async function getSuggestedGasFees(request) {
  const { getGasFeeEstimates, provider } = request;
  try {
    const { gasFeeEstimates, gasEstimateType } = await getGasFeeEstimates();
    if (gasEstimateType === GAS_ESTIMATE_TYPES.FEE_MARKET) {
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
    if (gasEstimateType === GAS_ESTIMATE_TYPES.LEGACY) {
      const maxFeePerGas2 = gweiDecimalToWeiHex(gasFeeEstimates.medium);
      log("Using medium value from legacy estimate", maxFeePerGas2);
      return {
        maxFeePerGas: maxFeePerGas2
      };
    }
    if (gasEstimateType === GAS_ESTIMATE_TYPES.ETH_GASPRICE) {
      const maxFeePerGas2 = gweiDecimalToWeiHex(gasFeeEstimates.gasPrice);
      log("Using gasPrice from estimate", maxFeePerGas2);
      return {
        maxFeePerGas: maxFeePerGas2
      };
    }
  } catch (error) {
    log("Failed to get estimate", error);
  }
  const gasPriceDecimal = await query(new EthQuery(provider), "gasPrice");
  if (!gasPriceDecimal) {
    return {};
  }
  const maxFeePerGas = add0x(gasPriceDecimal.toString(16));
  log("Using gasPrice from network as fallback", maxFeePerGas);
  return { maxFeePerGas };
}
function gweiDecimalToWeiHex(value) {
  return toHex(gweiDecToWEIBN(value));
}
function isGasFeeEmpty(value) {
  return !value || value === EMPTY_BYTES;
}

export {
  updateGasFees
};
//# sourceMappingURL=chunk-DOOXEL47.mjs.map