"use strict";Object.defineProperty(exports, "__esModule", {value: true});

var _chunkUGN7PBONjs = require('./chunk-UGN7PBON.js');


var _chunkS6VGOPUYjs = require('./chunk-S6VGOPUY.js');

// src/utils/etherscan.ts
var _controllerutils = require('@metamask/controller-utils');
async function fetchEtherscanTransactions({
  address,
  chainId,
  fromBlock,
  limit
}) {
  return await fetchTransactions("txlist", {
    address,
    chainId,
    fromBlock,
    limit
  });
}
async function fetchEtherscanTokenTransactions({
  address,
  chainId,
  fromBlock,
  limit
}) {
  return await fetchTransactions("tokentx", {
    address,
    chainId,
    fromBlock,
    limit
  });
}
async function fetchTransactions(action, {
  address,
  chainId,
  fromBlock,
  limit
}) {
  const urlParams = {
    module: "account",
    address,
    startBlock: fromBlock?.toString(),
    offset: limit?.toString(),
    sort: "desc"
  };
  const etherscanTxUrl = getEtherscanApiUrl(chainId, {
    ...urlParams,
    action
  });
  _chunkS6VGOPUYjs.incomingTransactionsLogger.call(void 0, "Sending Etherscan request", etherscanTxUrl);
  const response = await _controllerutils.handleFetch.call(void 0, 
    etherscanTxUrl
  );
  return response;
}
function getEtherscanApiUrl(chainId, urlParams) {
  const apiUrl = getEtherscanApiHost(chainId);
  let url = `${apiUrl}/api?`;
  for (const paramKey of Object.keys(urlParams)) {
    const value = urlParams[paramKey];
    if (!value) {
      continue;
    }
    url += `${paramKey}=${value}&`;
  }
  url += "tag=latest&page=1";
  return url;
}
function getEtherscanApiHost(chainId) {
  const networkInfo = _chunkUGN7PBONjs.ETHERSCAN_SUPPORTED_NETWORKS[chainId];
  if (!networkInfo) {
    throw new Error(`Etherscan does not support chain with ID: ${chainId}`);
  }
  return `https://${networkInfo.subdomain}.${networkInfo.domain}`;
}





exports.fetchEtherscanTransactions = fetchEtherscanTransactions; exports.fetchEtherscanTokenTransactions = fetchEtherscanTokenTransactions; exports.getEtherscanApiHost = getEtherscanApiHost;
//# sourceMappingURL=chunk-XVYXRCRL.js.map