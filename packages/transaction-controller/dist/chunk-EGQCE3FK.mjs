import {
  ETHERSCAN_SUPPORTED_NETWORKS
} from "./chunk-O6ZZVIFH.mjs";
import {
  incomingTransactionsLogger
} from "./chunk-UQQWZT6C.mjs";

// src/utils/etherscan.ts
import { handleFetch } from "@metamask/controller-utils";
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
  incomingTransactionsLogger("Sending Etherscan request", etherscanTxUrl);
  const response = await handleFetch(
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
  const networkInfo = ETHERSCAN_SUPPORTED_NETWORKS[chainId];
  if (!networkInfo) {
    throw new Error(`Etherscan does not support chain with ID: ${chainId}`);
  }
  return `https://${networkInfo.subdomain}.${networkInfo.domain}`;
}

export {
  fetchEtherscanTransactions,
  fetchEtherscanTokenTransactions,
  getEtherscanApiHost
};
//# sourceMappingURL=chunk-EGQCE3FK.mjs.map