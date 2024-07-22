import {
  isTokenListSupportedForNetwork
} from "./chunk-BZEAPSD5.mjs";

// src/token-service.ts
import {
  ChainId,
  convertHexToDecimal,
  timeoutFetch
} from "@metamask/controller-utils";
var TOKEN_END_POINT_API = "https://token.api.cx.metamask.io";
var TOKEN_METADATA_NO_SUPPORT_ERROR = "TokenService Error: Network does not support fetchTokenMetadata";
function getTokensURL(chainId) {
  const occurrenceFloor = chainId === ChainId["linea-mainnet"] ? 1 : 3;
  return `${TOKEN_END_POINT_API}/tokens/${convertHexToDecimal(
    chainId
  )}?occurrenceFloor=${occurrenceFloor}&includeNativeAssets=false&includeDuplicateSymbolAssets=false&includeTokenFees=false&includeAssetType=false&includeERC20Permit=false&includeStorage=false`;
}
function getTokenMetadataURL(chainId, tokenAddress) {
  return `${TOKEN_END_POINT_API}/token/${convertHexToDecimal(
    chainId
  )}?address=${tokenAddress}`;
}
var tenSecondsInMilliseconds = 1e4;
var defaultTimeout = tenSecondsInMilliseconds;
async function fetchTokenListByChainId(chainId, abortSignal, { timeout = defaultTimeout } = {}) {
  const tokenURL = getTokensURL(chainId);
  const response = await queryApi(tokenURL, abortSignal, timeout);
  if (response) {
    const result = await parseJsonResponse(response);
    if (Array.isArray(result) && chainId === ChainId["linea-mainnet"]) {
      return result.filter(
        (elm) => elm.aggregators.includes("lineaTeam") || elm.aggregators.length >= 3
      );
    }
    return result;
  }
  return void 0;
}
async function fetchTokenMetadata(chainId, tokenAddress, abortSignal, { timeout = defaultTimeout } = {}) {
  if (!isTokenListSupportedForNetwork(chainId)) {
    throw new Error(TOKEN_METADATA_NO_SUPPORT_ERROR);
  }
  const tokenMetadataURL = getTokenMetadataURL(chainId, tokenAddress);
  const response = await queryApi(tokenMetadataURL, abortSignal, timeout);
  if (response) {
    return parseJsonResponse(response);
  }
  return void 0;
}
async function queryApi(apiURL, abortSignal, timeout) {
  const fetchOptions = {
    referrer: apiURL,
    referrerPolicy: "no-referrer-when-downgrade",
    method: "GET",
    mode: "cors",
    signal: abortSignal,
    cache: "default"
  };
  fetchOptions.headers = new window.Headers();
  fetchOptions.headers.set("Content-Type", "application/json");
  try {
    return await timeoutFetch(apiURL, fetchOptions, timeout);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.log("Request is aborted");
    }
  }
  return void 0;
}
async function parseJsonResponse(apiResponse) {
  const responseObj = await apiResponse.json();
  if (responseObj?.error) {
    throw new Error(`TokenService Error: ${responseObj.error}`);
  }
  return responseObj;
}

export {
  TOKEN_END_POINT_API,
  TOKEN_METADATA_NO_SUPPORT_ERROR,
  fetchTokenListByChainId,
  fetchTokenMetadata
};
//# sourceMappingURL=chunk-AX522TDL.mjs.map