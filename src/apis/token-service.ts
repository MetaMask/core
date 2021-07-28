import { timeoutFetch } from '../util';

const END_POINT = 'https://token-api.airswap-prod.codefi.network';

function syncTokensURL(chainId: string) {
  return `${END_POINT}/sync/${chainId}`;
}
function getTokensURL(chainId: string) {
  return `${END_POINT}/tokens/${chainId}`;
}
function getTokenMetadataURL(chainId: string, tokenAddress: string) {
  return `${END_POINT}/tokens/${chainId}?address=${tokenAddress}`;
}

/**
 * Fetches the list of token metadata for a given network chainId
 *
 * @returns - Promise resolving token List
 */
export async function fetchTokenList(chainId: string): Promise<unknown> {
  const tokenURL = getTokensURL(chainId);
  return queryApi(tokenURL);
}

/**
 * Forces a sync of token metadata for a given network chainId.
 * Syncing happens every 1 hour in the background, this api can
 * be used to force a sync from our side
 */
export async function syncTokens(chainId: string): Promise<void> {
  const syncURL = syncTokensURL(chainId);
  queryApi(syncURL);
}

/**
 * Fetch metadata for the token address provided for a given network chainId
 *
 * @return Promise resolving token metadata for the tokenAddress provided
 */
export async function fetchTokenMetadata(
  chainId: string,
  tokenAddress: string,
): Promise<unknown> {
  const tokenMetadataURL = getTokenMetadataURL(chainId, tokenAddress);
  return queryApi(tokenMetadataURL);
}

/**
 * Fetch metadata for the token address provided for a given network chainId
 *
 * @return Promise resolving request response json value
 */
async function queryApi(apiURL: string): Promise<unknown> {
  const fetchOptions: RequestInit = {
    referrer: apiURL,
    referrerPolicy: 'no-referrer-when-downgrade',
    method: 'GET',
    mode: 'cors',
  };
  fetchOptions.headers = new window.Headers();
  fetchOptions.headers.set('Content-Type', 'application/json');
  const tokenResponse = await timeoutFetch(apiURL, fetchOptions);
  const responseObj = await tokenResponse.json();
  // api may return errors as json without setting an error http status code
  if (responseObj?.error) {
    throw new Error(`TokenService Error: ${responseObj.error}`);
  }
  return responseObj;
}
