import {
  ChainId,
  convertHexToDecimal,
  handleFetch,
  timeoutFetch,
} from '@metamask/controller-utils';
import type { CaipChainId, Hex } from '@metamask/utils';

import { isTokenListSupportedForNetwork } from './assetsUtil';

export const TOKEN_END_POINT_API = 'https://token.api.cx.metamask.io';
export const TOKEN_METADATA_NO_SUPPORT_ERROR =
  'TokenService Error: Network does not support fetchTokenMetadata';

/**
 * Get the tokens URL for a specific network.
 *
 * @param chainId - The chain ID of the network the tokens requested are on.
 * @returns The tokens URL.
 */
function getTokensURL(chainId: Hex) {
  const occurrenceFloor = chainId === ChainId['linea-mainnet'] ? 1 : 3;
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
  return `${TOKEN_END_POINT_API}/tokens/${convertHexToDecimal(
    chainId,
  )}?occurrenceFloor=${occurrenceFloor}&includeNativeAssets=false&includeTokenFees=false&includeAssetType=false&includeERC20Permit=false&includeStorage=false`;
}

/**
 * Get the token metadata URL for the given network and token.
 *
 * @param chainId - The chain ID of the network the token is on.
 * @param tokenAddress - The token address.
 * @returns The token metadata URL.
 */
function getTokenMetadataURL(chainId: Hex, tokenAddress: string) {
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
  return `${TOKEN_END_POINT_API}/token/${convertHexToDecimal(
    chainId,
  )}?address=${tokenAddress}`;
}

/**
 * Get the token search URL for the given networks and search query.
 *
 * @param chainIds - Array of CAIP format chain IDs (e.g., 'eip155:1', 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp').
 * @param query - The search query (token name, symbol, or address).
 * @param limit - Optional limit for the number of results (defaults to 10).
 * @returns The token search URL.
 */
function getTokenSearchURL(chainIds: CaipChainId[], query: string, limit = 10) {
  const encodedQuery = encodeURIComponent(query);
  const encodedChainIds = chainIds
    .map((id) => encodeURIComponent(id))
    .join(',');
  return `${TOKEN_END_POINT_API}/tokens/search?chainIds=${encodedChainIds}&query=${encodedQuery}&limit=${limit}`;
}

const tenSecondsInMilliseconds = 10_000;

// Token list averages 1.6 MB in size
// timeoutFetch by default has a 500ms timeout, which will almost always timeout given the response size.
const defaultTimeout = tenSecondsInMilliseconds;

/**
 * Fetch the list of token metadata for a given network. This request is cancellable using the
 * abort signal passed in.
 *
 * @param chainId - The chain ID of the network the requested tokens are on.
 * @param abortSignal - The abort signal used to cancel the request if necessary.
 * @param options - Additional fetch options.
 * @param options.timeout - The fetch timeout.
 * @returns The token list, or `undefined` if the request was cancelled.
 */
export async function fetchTokenListByChainId(
  chainId: Hex,
  abortSignal: AbortSignal,
  { timeout = defaultTimeout } = {},
): Promise<unknown> {
  const tokenURL = getTokensURL(chainId);
  const response = await queryApi(tokenURL, abortSignal, timeout);
  if (response) {
    const result = await parseJsonResponse(response);
    if (Array.isArray(result) && chainId === ChainId['linea-mainnet']) {
      return result.filter(
        (elm) =>
          elm.aggregators.includes('lineaTeam') || elm.aggregators.length >= 3,
      );
    }
    return result;
  }
  return undefined;
}

/**
 * Search for tokens across one or more networks by query string using CAIP format chain IDs.
 *
 * @param chainIds - Array of CAIP format chain IDs (e.g., ['eip155:1', 'eip155:137', 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp']).
 * @param query - The search query (token name, symbol, or address).
 * @param options - Additional fetch options.
 * @param options.limit - The maximum number of results to return.
 * @returns Object containing count and data array. Returns { count: 0, data: [] } if request fails.
 */
export async function searchTokens(
  chainIds: CaipChainId[],
  query: string,
  { limit = 10 } = {},
): Promise<{ count: number; data: unknown[] }> {
  if (chainIds.length === 0) {
    return { count: 0, data: [] };
  }

  const tokenSearchURL = getTokenSearchURL(chainIds, query, limit);

  try {
    const result = await handleFetch(tokenSearchURL);

    // The API returns an object with structure: { count: number, data: array, pageInfo: object }
    if (result && typeof result === 'object' && Array.isArray(result.data)) {
      return {
        count: result.count || result.data.length,
        data: result.data,
      };
    }

    // Fallback: if result is directly an array (for backwards compatibility)
    if (Array.isArray(result)) {
      return {
        count: result.length,
        data: result,
      };
    }

    // Handle non-expected responses
    return { count: 0, data: [] };
  } catch (error) {
    // Handle 400 errors and other failures by returning count 0 and empty array
    console.log('Search request failed:', error);
    return { count: 0, data: [] };
  }
}

/**
 * Fetch metadata for the token address provided for a given network. This request is cancellable
 * using the abort signal passed in.
 *
 * @param chainId - The chain ID of the network the token is on.
 * @param tokenAddress - The address of the token to fetch metadata for.
 * @param abortSignal - The abort signal used to cancel the request if necessary.
 * @param options - Additional fetch options.
 * @param options.timeout - The fetch timeout.
 * @returns The token metadata, or `undefined` if the request was either aborted or failed.
 */
// TODO: Either fix this lint violation or explain why it's necessary to ignore.
// eslint-disable-next-line @typescript-eslint/naming-convention
export async function fetchTokenMetadata<T>(
  chainId: Hex,
  tokenAddress: string,
  abortSignal: AbortSignal,
  { timeout = defaultTimeout } = {},
): Promise<T | undefined> {
  if (!isTokenListSupportedForNetwork(chainId)) {
    throw new Error(TOKEN_METADATA_NO_SUPPORT_ERROR);
  }
  const tokenMetadataURL = getTokenMetadataURL(chainId, tokenAddress);
  const response = await queryApi(tokenMetadataURL, abortSignal, timeout);
  if (response) {
    return parseJsonResponse(response) as Promise<T>;
  }
  return undefined;
}

/**
 * Perform fetch request against the api.
 *
 * @param apiURL - The URL of the API to fetch.
 * @param abortSignal - The abort signal used to cancel the request if necessary.
 * @param timeout - The fetch timeout.
 * @returns Promise resolving request response.
 */
async function queryApi(
  apiURL: string,
  abortSignal: AbortSignal,
  timeout: number,
): Promise<Response | undefined> {
  const fetchOptions: RequestInit = {
    referrer: apiURL,
    referrerPolicy: 'no-referrer-when-downgrade',
    method: 'GET',
    mode: 'cors',
    signal: abortSignal,
    cache: 'default',
  };
  fetchOptions.headers = new window.Headers();
  fetchOptions.headers.set('Content-Type', 'application/json');
  try {
    return await timeoutFetch(apiURL, fetchOptions, timeout);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.log('Request is aborted');
    }
  }
  return undefined;
}

/**
 * Parse an API response and return the response JSON data.
 *
 * @param apiResponse - The API response to parse.
 * @returns The response JSON data.
 * @throws Will throw if the response includes an error.
 */
async function parseJsonResponse(apiResponse: Response): Promise<unknown> {
  const responseObj = await apiResponse.json();
  // api may return errors as json without setting an error http status code
  if (responseObj?.error) {
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    throw new Error(`TokenService Error: ${responseObj.error}`);
  }
  return responseObj;
}
