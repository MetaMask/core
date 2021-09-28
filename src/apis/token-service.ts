import { timeoutFetch } from '../util';

const END_POINT = 'https://token-api.metaswap.codefi.network';

/**
 * Get the tokens URL for a specific network.
 *
 * @param chainId - The chain ID of the network the tokens requested are on.
 * @returns The tokens URL.
 */
function getTokensURL(chainId: string) {
  return `${END_POINT}/tokens/${chainId}`;
}

/**
 * Get the token metadata URL for the given network and token.
 *
 * @param chainId - The chain ID of the network the token is on.
 * @param tokenAddress - The token address.
 * @returns The token metadata URL.
 */
function getTokenMetadataURL(chainId: string, tokenAddress: string) {
  return `${END_POINT}/token/${chainId}?address=${tokenAddress}`;
}

// Token list averages 1.6 MB in size
// timeoutFetch by default has a 500ms timeout, which will almost always timeout given the response size.
const timeout = 10000;

/**
 * Fetch the list of token metadata for a given network. This request is cancellable using the
 * abort signal passed in.
 *
 * @param chainId - The chain ID of the network the requested tokens are on.
 * @param abortSignal - The abort signal used to cancel the request if necessary.
 * @returns The token list, or `undefined` if the request was cancelled.
 */
export async function fetchTokenList(
  chainId: string,
  abortSignal: AbortSignal,
): Promise<unknown> {
  const tokenURL = getTokensURL(chainId);
  const response = await queryApi(tokenURL, abortSignal);
  if (response) {
    return parseJsonResponse(response);
  }
  return undefined;
}

/**
 * Fetch metadata for the token address provided for a given network. This request is cancellable
 * using the abort signal passed in.
 *
 * @param chainId - The chain ID of the network the token is on.
 * @param tokenAddress - The address of the token to fetch metadata for.
 * @param abortSignal - The abort signal used to cancel the request if necessary.
 * @returns The token metadata, or `undefined` if the request was cancelled.
 */
export async function fetchTokenMetadata(
  chainId: string,
  tokenAddress: string,
  abortSignal: AbortSignal,
): Promise<unknown> {
  const tokenMetadataURL = getTokenMetadataURL(chainId, tokenAddress);
  const response = await queryApi(tokenMetadataURL, abortSignal);
  if (response) {
    return parseJsonResponse(response);
  }
  return undefined;
}

/**
 * Perform fetch request against the api.
 *
 * @param apiURL - The URL of the API to fetch.
 * @param abortSignal - The abort signal used to cancel the request if necessary.
 * @returns Promise resolving request response.
 */
async function queryApi(
  apiURL: string,
  abortSignal: AbortSignal,
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
  } catch (err) {
    if (err.name === 'AbortError') {
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
    throw new Error(`TokenService Error: ${responseObj.error}`);
  }
  return responseObj;
}
