import {
  SWAP_TRANSACTION_TYPES
} from "./chunk-GNAL5HC2.mjs";
import {
  getGasFeeFlow
} from "./chunk-JXXTNVU4.mjs";
import {
  projectLogger
} from "./chunk-UQQWZT6C.mjs";

// src/utils/gas-fees.ts
import {
  ORIGIN_METAMASK,
  gweiDecToWEIBN,
  query,
  toHex
} from "@metamask/controller-utils";
import { add0x, createModuleLogger } from "@metamask/utils";
var log = createModuleLogger(projectLogger, "gas-fees");
async function updateGasFees(request) {
  const { txMeta } = request;
  const initialParams = { ...txMeta.txParams };
  const isSwap = SWAP_TRANSACTION_TYPES.includes(
    txMeta.type
  );
  const savedGasFees = isSwap ? void 0 : request.getSavedGasFees(txMeta.chainId);
  const suggestedGasFees = await getSuggestedGasFees(request);
  log("Suggested gas fees", suggestedGasFees);
  const getGasFeeRequest = {
    ...request,
    initialParams,
    savedGasFees,
    suggestedGasFees
  };
  txMeta.txParams.maxFeePerGas = getMaxFeePerGas(getGasFeeRequest);
  txMeta.txParams.maxPriorityFeePerGas = getMaxPriorityFeePerGas(getGasFeeRequest);
  txMeta.txParams.gasPrice = getGasPrice(getGasFeeRequest);
  txMeta.userFeeLevel = getUserFeeLevel(getGasFeeRequest);
  log("Updated gas fee properties", {
    maxFeePerGas: txMeta.txParams.maxFeePerGas,
    maxPriorityFeePerGas: txMeta.txParams.maxPriorityFeePerGas,
    gasPrice: txMeta.txParams.gasPrice
  });
  if (txMeta.txParams.maxFeePerGas || txMeta.txParams.maxPriorityFeePerGas) {
    delete txMeta.txParams.gasPrice;
  }
  if (txMeta.txParams.gasPrice) {
    delete txMeta.txParams.maxFeePerGas;
    delete txMeta.txParams.maxPriorityFeePerGas;
  }
  updateDefaultGasEstimates(txMeta);
}
function gweiDecimalToWeiHex(value) {
  return toHex(gweiDecToWEIBN(value));
}
function getMaxFeePerGas(request) {
  const { savedGasFees, eip1559, initialParams, suggestedGasFees } = request;
  if (!eip1559) {
    return void 0;
  }
  if (savedGasFees) {
    const maxFeePerGas = gweiDecimalToWeiHex(savedGasFees.maxBaseFee);
    log("Using maxFeePerGas from savedGasFees", maxFeePerGas);
    return maxFeePerGas;
  }
  if (initialParams.maxFeePerGas) {
    log("Using maxFeePerGas from request", initialParams.maxFeePerGas);
    return initialParams.maxFeePerGas;
  }
  if (initialParams.gasPrice && !initialParams.maxPriorityFeePerGas) {
    log(
      "Setting maxFeePerGas to gasPrice from request",
      initialParams.gasPrice
    );
    return initialParams.gasPrice;
  }
  if (suggestedGasFees.maxFeePerGas) {
    log("Using suggested maxFeePerGas", suggestedGasFees.maxFeePerGas);
    return suggestedGasFees.maxFeePerGas;
  }
  if (suggestedGasFees.gasPrice) {
    log(
      "Setting maxFeePerGas to suggested gasPrice",
      suggestedGasFees.gasPrice
    );
    return suggestedGasFees.gasPrice;
  }
  log("maxFeePerGas not set");
  return void 0;
}
function getMaxPriorityFeePerGas(request) {
  const { eip1559, initialParams, savedGasFees, suggestedGasFees, txMeta } = request;
  if (!eip1559) {
    return void 0;
  }
  if (savedGasFees) {
    const maxPriorityFeePerGas = gweiDecimalToWeiHex(savedGasFees.priorityFee);
    log(
      "Using maxPriorityFeePerGas from savedGasFees.priorityFee",
      maxPriorityFeePerGas
    );
    return maxPriorityFeePerGas;
  }
  if (initialParams.maxPriorityFeePerGas) {
    log(
      "Using maxPriorityFeePerGas from request",
      initialParams.maxPriorityFeePerGas
    );
    return initialParams.maxPriorityFeePerGas;
  }
  if (initialParams.gasPrice && !initialParams.maxFeePerGas) {
    log(
      "Setting maxPriorityFeePerGas to gasPrice from request",
      initialParams.gasPrice
    );
    return initialParams.gasPrice;
  }
  if (suggestedGasFees.maxPriorityFeePerGas) {
    log(
      "Using suggested maxPriorityFeePerGas",
      suggestedGasFees.maxPriorityFeePerGas
    );
    return suggestedGasFees.maxPriorityFeePerGas;
  }
  if (txMeta.txParams.maxFeePerGas) {
    log(
      "Setting maxPriorityFeePerGas to maxFeePerGas",
      txMeta.txParams.maxFeePerGas
    );
    return txMeta.txParams.maxFeePerGas;
  }
  log("maxPriorityFeePerGas not set");
  return void 0;
}
function getGasPrice(request) {
  const { eip1559, initialParams, suggestedGasFees } = request;
  if (eip1559) {
    return void 0;
  }
  if (initialParams.gasPrice) {
    log("Using gasPrice from request", initialParams.gasPrice);
    return initialParams.gasPrice;
  }
  if (suggestedGasFees.maxFeePerGas) {
    log("Using suggested maxFeePerGas", suggestedGasFees.maxFeePerGas);
    return suggestedGasFees.maxFeePerGas;
  }
  if (suggestedGasFees.gasPrice) {
    log("Using suggested gasPrice", suggestedGasFees.gasPrice);
    return suggestedGasFees.gasPrice;
  }
  log("gasPrice not set");
  return void 0;
}
function getUserFeeLevel(request) {
  const { eip1559, initialParams, savedGasFees, suggestedGasFees, txMeta } = request;
  if (!eip1559) {
    return void 0;
  }
  if (savedGasFees) {
    return "custom" /* CUSTOM */;
  }
  if (!initialParams.maxFeePerGas && !initialParams.maxPriorityFeePerGas && initialParams.gasPrice) {
    return txMeta.origin === ORIGIN_METAMASK ? "custom" /* CUSTOM */ : "dappSuggested" /* DAPP_SUGGESTED */;
  }
  if (!initialParams.maxFeePerGas && !initialParams.maxPriorityFeePerGas && suggestedGasFees.maxFeePerGas && suggestedGasFees.maxPriorityFeePerGas) {
    return "medium" /* MEDIUM */;
  }
  if (txMeta.origin === ORIGIN_METAMASK) {
    return "medium" /* MEDIUM */;
  }
  return "dappSuggested" /* DAPP_SUGGESTED */;
}
function updateDefaultGasEstimates(txMeta) {
  if (!txMeta.defaultGasEstimates) {
    txMeta.defaultGasEstimates = {};
  }
  txMeta.defaultGasEstimates.maxFeePerGas = txMeta.txParams.maxFeePerGas;
  txMeta.defaultGasEstimates.maxPriorityFeePerGas = txMeta.txParams.maxPriorityFeePerGas;
  txMeta.defaultGasEstimates.gasPrice = txMeta.txParams.gasPrice;
  txMeta.defaultGasEstimates.estimateType = txMeta.userFeeLevel;
}
async function getSuggestedGasFees(request) {
  const { eip1559, ethQuery, gasFeeFlows, getGasFeeEstimates, txMeta } = request;
  const { networkClientId } = txMeta;
  if (!eip1559 && txMeta.txParams.gasPrice || eip1559 && txMeta.txParams.maxFeePerGas && txMeta.txParams.maxPriorityFeePerGas) {
    return {};
  }
  const gasFeeFlow = getGasFeeFlow(txMeta, gasFeeFlows);
  try {
    const gasFeeControllerData = await getGasFeeEstimates({ networkClientId });
    const response = await gasFeeFlow.getGasFees({
      ethQuery,
      gasFeeControllerData,
      transactionMeta: txMeta
    });
    const gasFeeEstimateType = response.estimates?.type;
    switch (gasFeeEstimateType) {
      case "fee-market" /* FeeMarket */:
        return response.estimates.medium;
      case "legacy" /* Legacy */:
        return {
          gasPrice: response.estimates.medium
        };
      case "eth_gasPrice" /* GasPrice */:
        return { gasPrice: response.estimates.gasPrice };
      default:
        throw new Error(
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `Unsupported gas fee estimate type returned from flow: ${gasFeeEstimateType}`
        );
    }
  } catch (error) {
    log("Failed to get suggested gas fees", error);
  }
  const gasPriceDecimal = await query(ethQuery, "gasPrice");
  const gasPrice = gasPriceDecimal ? add0x(gasPriceDecimal.toString(16)) : void 0;
  return { gasPrice };
}

export {
  updateGasFees,
  gweiDecimalToWeiHex
};
//# sourceMappingURL=chunk-VXNPVIYL.mjs.map