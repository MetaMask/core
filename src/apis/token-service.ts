import { timeoutFetch } from '../util';

const END_POINT = 'https://token-api.airswap-prod.codefi.network';

function syncTokensURL(chainId: string) {
  return `${END_POINT}/sync/${chainId}`;
}
function getTokensURL(chainId: string) {
  return `${END_POINT}/tokens/${chainId}`;
}
function getTopAssetsURL(chainId: string) {
  return `${END_POINT}/topAssets/${chainId}`;
}
function getTokenMetadataURL(chainId: string, tokenAddress: string) {
  return `${END_POINT}/tokens/${chainId}?address=${tokenAddress}`;
}

/**
 * Fetches the list of token metadata for a given network chainId
 *
 * @returns - Promise resolving token  List
 */
export async function fetchTokenList(chainId: string): Promise<Response> {
  const tokenURL = getTokensURL(chainId);
  const fetchOptions: RequestInit = {
    referrer: tokenURL,
    referrerPolicy: 'no-referrer-when-downgrade',
    method: 'GET',
    mode: 'cors',
  };
  fetchOptions.headers = new window.Headers();
  fetchOptions.headers.set('Content-Type', 'application/json');
  const tokenResponse = await timeoutFetch(tokenURL, fetchOptions);
  return await tokenResponse.json();
}

/**
 * Forces a sync of token metadata for a given network chainId.
 * Syncing happens every 1 hour in the background, this api can
 * be used to force a sync from our side
 */
export async function syncTokens(chainId: string): Promise<void> {
  const syncURL = syncTokensURL(chainId);
  const fetchOptions: RequestInit = {
    referrer: syncURL,
    referrerPolicy: 'no-referrer-when-downgrade',
    method: 'GET',
    mode: 'cors',
  };
  fetchOptions.headers = new window.Headers();
  fetchOptions.headers.set('Content-Type', 'application/json');
  await timeoutFetch(syncURL, fetchOptions);
}

/**
 * Fetches  all the top assets token metadata for a given network chainId
 *
 * @return Promise resolving top assets
 */
export async function fetchTopAssets(chainId: string): Promise<Response> {
  const topAssetURL = getTopAssetsURL(chainId);
  const fetchOptions: RequestInit = {
    referrer: topAssetURL,
    referrerPolicy: 'no-referrer-when-downgrade',
    method: 'GET',
    mode: 'cors',
  };
  fetchOptions.headers = new window.Headers();
  fetchOptions.headers.set('Content-Type', 'application/json');
  const tokenResponse = await timeoutFetch(topAssetURL, fetchOptions);
  return await tokenResponse.json();
}

/**
 * Fetch metadata for the token address provided for a given network chainId
 *
 * @return Promise resolving token metadata for the tokenAddress provided
 */
export async function fetchTokenMetadata(
  chainId: string,
  tokenAddress: string,
): Promise<Response> {
  const tokenMetadataURL = getTokenMetadataURL(chainId, tokenAddress);
  const fetchOptions: RequestInit = {
    referrer: tokenMetadataURL,
    referrerPolicy: 'no-referrer-when-downgrade',
    method: 'GET',
    mode: 'cors',
  };
  fetchOptions.headers = new window.Headers();
  fetchOptions.headers.set('Content-Type', 'application/json');
  const tokenResponse = await timeoutFetch(tokenMetadataURL, fetchOptions);
  return await tokenResponse.json();
}
