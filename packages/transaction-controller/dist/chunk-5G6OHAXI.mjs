import {
  GAS_BUFFER_CHAIN_OVERRIDES
} from "./chunk-O6ZZVIFH.mjs";
import {
  projectLogger
} from "./chunk-UQQWZT6C.mjs";

// src/utils/gas.ts
import {
  BNToHex,
  fractionBN,
  hexToBN,
  query
} from "@metamask/controller-utils";
import { add0x, createModuleLogger } from "@metamask/utils";
var log = createModuleLogger(projectLogger, "gas");
var FIXED_GAS = "0x5208";
var DEFAULT_GAS_MULTIPLIER = 1.5;
async function updateGas(request) {
  const { txMeta } = request;
  const initialParams = { ...txMeta.txParams };
  const [gas, simulationFails] = await getGas(request);
  txMeta.txParams.gas = gas;
  txMeta.simulationFails = simulationFails;
  if (!initialParams.gas) {
    txMeta.originalGasEstimate = txMeta.txParams.gas;
  }
  if (!txMeta.defaultGasEstimates) {
    txMeta.defaultGasEstimates = {};
  }
  txMeta.defaultGasEstimates.gas = txMeta.txParams.gas;
}
async function estimateGas(txParams, ethQuery) {
  const request = { ...txParams };
  const { data, value } = request;
  const { gasLimit: gasLimitHex, number: blockNumber } = await getLatestBlock(
    ethQuery
  );
  const gasLimitBN = hexToBN(gasLimitHex);
  request.data = data ? add0x(data) : data;
  request.gas = BNToHex(fractionBN(gasLimitBN, 19, 20));
  request.value = value || "0x0";
  let estimatedGas = request.gas;
  let simulationFails;
  try {
    estimatedGas = await query(ethQuery, "estimateGas", [request]);
  } catch (error) {
    simulationFails = {
      reason: error.message,
      errorKey: error.errorKey,
      debug: {
        blockNumber,
        blockGasLimit: gasLimitHex
      }
    };
    log("Estimation failed", { ...simulationFails, fallback: estimateGas });
  }
  return {
    blockGasLimit: gasLimitHex,
    estimatedGas,
    simulationFails
  };
}
function addGasBuffer(estimatedGas, blockGasLimit, multiplier) {
  const estimatedGasBN = hexToBN(estimatedGas);
  const maxGasBN = hexToBN(blockGasLimit).muln(0.9);
  const paddedGasBN = estimatedGasBN.muln(multiplier);
  if (estimatedGasBN.gt(maxGasBN)) {
    const estimatedGasHex = add0x(estimatedGas);
    log("Using estimated value", estimatedGasHex);
    return estimatedGasHex;
  }
  if (paddedGasBN.lt(maxGasBN)) {
    const paddedHex = add0x(BNToHex(paddedGasBN));
    log("Using padded estimate", paddedHex, multiplier);
    return paddedHex;
  }
  const maxHex = add0x(BNToHex(maxGasBN));
  log("Using 90% of block gas limit", maxHex);
  return maxHex;
}
async function getGas(request) {
  const { isCustomNetwork, chainId, txMeta } = request;
  if (txMeta.txParams.gas) {
    log("Using value from request", txMeta.txParams.gas);
    return [txMeta.txParams.gas];
  }
  if (await requiresFixedGas(request)) {
    log("Using fixed value", FIXED_GAS);
    return [FIXED_GAS];
  }
  const { blockGasLimit, estimatedGas, simulationFails } = await estimateGas(
    txMeta.txParams,
    request.ethQuery
  );
  if (isCustomNetwork) {
    log("Using original estimate as custom network");
    return [estimatedGas, simulationFails];
  }
  const bufferMultiplier = GAS_BUFFER_CHAIN_OVERRIDES[chainId] ?? DEFAULT_GAS_MULTIPLIER;
  const bufferedGas = addGasBuffer(
    estimatedGas,
    blockGasLimit,
    bufferMultiplier
  );
  return [bufferedGas, simulationFails];
}
async function requiresFixedGas({
  ethQuery,
  txMeta,
  isCustomNetwork
}) {
  const {
    txParams: { to, data }
  } = txMeta;
  if (isCustomNetwork || !to || data) {
    return false;
  }
  const code = await getCode(ethQuery, to);
  return !code || code === "0x";
}
async function getCode(ethQuery, address) {
  return await query(ethQuery, "getCode", [address]);
}
async function getLatestBlock(ethQuery) {
  return await query(ethQuery, "getBlockByNumber", ["latest", false]);
}

export {
  log,
  FIXED_GAS,
  DEFAULT_GAS_MULTIPLIER,
  updateGas,
  estimateGas,
  addGasBuffer
};
//# sourceMappingURL=chunk-5G6OHAXI.mjs.map