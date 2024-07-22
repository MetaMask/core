"use strict";Object.defineProperty(exports, "__esModule", {value: true});


var _chunkHMOSP33Fjs = require('./chunk-HMOSP33F.js');


var _chunkS6VGOPUYjs = require('./chunk-S6VGOPUY.js');

// src/utils/simulation-api.ts
var _controllerutils = require('@metamask/controller-utils');
var _utils = require('@metamask/utils');
var log = _utils.createModuleLogger.call(void 0, _chunkS6VGOPUYjs.projectLogger, "simulation-api");
var RPC_METHOD = "infura_simulateTransactions";
var BASE_URL = "https://tx-sentinel-{0}.api.cx.metamask.io/";
var ENDPOINT_NETWORKS = "networks";
var requestIdCounter = 0;
async function simulateTransactions(chainId, request) {
  const url = await getSimulationUrl(chainId);
  log("Sending request", url, request);
  const requestId = requestIdCounter;
  requestIdCounter += 1;
  const response = await fetch(url, {
    method: "POST",
    body: JSON.stringify({
      id: String(requestId),
      jsonrpc: "2.0",
      method: RPC_METHOD,
      params: [request]
    })
  });
  const responseJson = await response.json();
  log("Received response", responseJson);
  if (responseJson.error) {
    const { code, message } = responseJson.error;
    throw new (0, _chunkHMOSP33Fjs.SimulationError)(message, code);
  }
  return responseJson?.result;
}
async function getSimulationUrl(chainId) {
  const networkData = await getNetworkData();
  const chainIdDecimal = _controllerutils.convertHexToDecimal.call(void 0, chainId);
  const network = networkData[chainIdDecimal];
  if (!network?.confirmations) {
    log("Chain is not supported", chainId);
    throw new (0, _chunkHMOSP33Fjs.SimulationChainNotSupportedError)(chainId);
  }
  return getUrl(network.network);
}
async function getNetworkData() {
  const url = `${getUrl("ethereum-mainnet")}${ENDPOINT_NETWORKS}`;
  const response = await fetch(url);
  return response.json();
}
function getUrl(subdomain) {
  return BASE_URL.replace("{0}", subdomain);
}



exports.simulateTransactions = simulateTransactions;
//# sourceMappingURL=chunk-KT6UAKBB.js.map