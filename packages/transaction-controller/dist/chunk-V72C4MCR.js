"use strict";Object.defineProperty(exports, "__esModule", {value: true});

var _chunkUGN7PBONjs = require('./chunk-UGN7PBON.js');


var _chunkS6VGOPUYjs = require('./chunk-S6VGOPUY.js');

// src/utils/gas.ts





var _controllerutils = require('@metamask/controller-utils');
var _utils = require('@metamask/utils');
var log = _utils.createModuleLogger.call(void 0, _chunkS6VGOPUYjs.projectLogger, "gas");
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
  const gasLimitBN = _controllerutils.hexToBN.call(void 0, gasLimitHex);
  request.data = data ? _utils.add0x.call(void 0, data) : data;
  request.gas = _controllerutils.BNToHex.call(void 0, _controllerutils.fractionBN.call(void 0, gasLimitBN, 19, 20));
  request.value = value || "0x0";
  let estimatedGas = request.gas;
  let simulationFails;
  try {
    estimatedGas = await _controllerutils.query.call(void 0, ethQuery, "estimateGas", [request]);
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
  const estimatedGasBN = _controllerutils.hexToBN.call(void 0, estimatedGas);
  const maxGasBN = _controllerutils.hexToBN.call(void 0, blockGasLimit).muln(0.9);
  const paddedGasBN = estimatedGasBN.muln(multiplier);
  if (estimatedGasBN.gt(maxGasBN)) {
    const estimatedGasHex = _utils.add0x.call(void 0, estimatedGas);
    log("Using estimated value", estimatedGasHex);
    return estimatedGasHex;
  }
  if (paddedGasBN.lt(maxGasBN)) {
    const paddedHex = _utils.add0x.call(void 0, _controllerutils.BNToHex.call(void 0, paddedGasBN));
    log("Using padded estimate", paddedHex, multiplier);
    return paddedHex;
  }
  const maxHex = _utils.add0x.call(void 0, _controllerutils.BNToHex.call(void 0, maxGasBN));
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
  const bufferMultiplier = _chunkUGN7PBONjs.GAS_BUFFER_CHAIN_OVERRIDES[chainId] ?? DEFAULT_GAS_MULTIPLIER;
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
  return await _controllerutils.query.call(void 0, ethQuery, "getCode", [address]);
}
async function getLatestBlock(ethQuery) {
  return await _controllerutils.query.call(void 0, ethQuery, "getBlockByNumber", ["latest", false]);
}








exports.log = log; exports.FIXED_GAS = FIXED_GAS; exports.DEFAULT_GAS_MULTIPLIER = DEFAULT_GAS_MULTIPLIER; exports.updateGas = updateGas; exports.estimateGas = estimateGas; exports.addGasBuffer = addGasBuffer;
//# sourceMappingURL=chunk-V72C4MCR.js.map