import {
  SimulationChainNotSupportedError,
  SimulationError
} from "./chunk-HQSNKCXI.mjs";
import {
  projectLogger
} from "./chunk-UQQWZT6C.mjs";

// src/utils/simulation-api.ts
import { convertHexToDecimal } from "@metamask/controller-utils";
import { createModuleLogger } from "@metamask/utils";
var log = createModuleLogger(projectLogger, "simulation-api");
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
    throw new SimulationError(message, code);
  }
  return responseJson?.result;
}
async function getSimulationUrl(chainId) {
  const networkData = await getNetworkData();
  const chainIdDecimal = convertHexToDecimal(chainId);
  const network = networkData[chainIdDecimal];
  if (!network?.confirmations) {
    log("Chain is not supported", chainId);
    throw new SimulationChainNotSupportedError(chainId);
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

export {
  simulateTransactions
};
//# sourceMappingURL=chunk-K4KOSAGM.mjs.map