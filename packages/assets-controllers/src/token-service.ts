import {
  ChainId,
  convertHexToDecimal,
  handleFetch,
  timeoutFetch,
} from '@metamask/controller-utils';
import type { CaipAssetType, CaipChainId, Hex } from '@metamask/utils';

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
function getTokensURL(chainId: Hex): string {
  const occurrenceFloor =
    chainId === ChainId['linea-mainnet'] ||
    chainId === ChainId['megaeth-mainnet']
      ? 1
      : 3;

  return `${TOKEN_END_POINT_API}/tokens/${convertHexToDecimal(
    chainId,
  )}?occurrenceFloor=${occurrenceFloor}&includeNativeAssets=false&includeTokenFees=false&includeAssetType=false&includeERC20Permit=false&includeStorage=false&includeRwaData=true`;
}

/**
 * Get the token metadata URL for the given network and token.
 *
 * @param chainId - The chain ID of the network the token is on.
 * @param tokenAddress - The token address.
 * @returns The token metadata URL.
 */
function getTokenMetadataURL(chainId: Hex, tokenAddress: string): string {
  return `${TOKEN_END_POINT_API}/token/${convertHexToDecimal(
    chainId,
  )}?address=${tokenAddress}&includeRwaData=true`;
}

/**
 * The sort by field for trending tokens.
 */
export type SortTrendingBy =
  | 'm5_trending'
  | 'h1_trending'
  | 'h6_trending'
  | 'h24_trending';

/**
 * Get the token search URL for the given networks and search query.
 *
 * @param options - Options for getting token search URL.
 * @param options.chainIds - Array of CAIP format chain IDs (e.g., 'eip155:1', 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp').
 * @param options.query - The search query (token name, symbol, or address).
 * @param options.limit - Optional limit for the number of results (defaults to 10).
 * @param options.includeMarketData - Optional flag to include market data in the results (defaults to false).
 * @param options.includeRwaData - Optional flag to include RWA data in the results (defaults to false).
 * @returns The token search URL.
 */
function getTokenSearchURL(options: {
  chainIds: CaipChainId[];
  query: string;
  limit?: number;
  includeMarketData?: boolean;
  includeRwaData?: boolean;
}): string {
  const { chainIds, query, limit, ...optionalParams } = options;
  const encodedQuery = encodeURIComponent(query);
  const encodedChainIds = chainIds
    .map((id) => encodeURIComponent(id))
    .join(',');
  const queryParams = new URLSearchParams();
  Object.entries(optionalParams).forEach(([key, value]) => {
    if (value !== undefined) {
      queryParams.append(key, String(value));
    }
  });

  let numberOfItems;
  if (limit) {
    if (limit <= 50) {
      numberOfItems = limit;
    } else if (query.includes('Ondo') && limit <= 500) {
      // There is an exception on the API side https://github.com/consensys-vertical-apps/va-mmcx-token-api/pull/287
      numberOfItems = limit;
    } else {
      numberOfItems = 50;
    }
  }

  return `${TOKEN_END_POINT_API}/tokens/search?networks=${encodedChainIds}&query=${encodedQuery}${numberOfItems ? `&first=${numberOfItems}` : ''}&${queryParams.toString()}`;
}

/**
 * Get the trending tokens URL for the given networks and search query.
 *
 * @param options - Options for getting trending tokens.
 * @param options.chainIds - Array of CAIP format chain IDs (e.g., ['eip155:1', 'eip155:137', 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp']).
 * @param options.sort - The sort field.
 * @param options.minLiquidity - The minimum liquidity.
 * @param options.minVolume24hUsd - The minimum volume 24h in USD.
 * @param options.maxVolume24hUsd - The maximum volume 24h in USD.
 * @param options.minMarketCap - The minimum market cap.
 * @param options.maxMarketCap - The maximum market cap.
 * @param options.excludeLabels - Array of labels to exclude (e.g., ['stable_coin', 'blue_chip']).
 * @param options.includeRwaData - Optional flag to include RWA data in the results (defaults to false).
 * @param options.usePriceApiData - Optional flag to use price API data in the results (defaults to false).
 * @returns The trending tokens URL.
 */
function getTrendingTokensURL(options: {
  chainIds: CaipChainId[];
  sort?: SortTrendingBy;
  minLiquidity?: number;
  minVolume24hUsd?: number;
  maxVolume24hUsd?: number;
  minMarketCap?: number;
  maxMarketCap?: number;
  excludeLabels?: string[];
  includeRwaData?: boolean;
  usePriceApiData?: boolean;
}): string {
  const encodedChainIds = options.chainIds
    .map((id) => encodeURIComponent(id))
    .join(',');
  // Add the rest of query params if they are defined
  const queryParams = new URLSearchParams();
  const { chainIds, excludeLabels, ...rest } = options;
  Object.entries(rest).forEach(([key, value]) => {
    if (value !== undefined) {
      queryParams.append(key, String(value));
    }
  });

  // Handle excludeLabels separately to avoid encoding the commas
  // The API expects: excludeLabels=stable_coin,blue_chip (not %2C)
  const excludeLabelsParam =
    excludeLabels !== undefined && excludeLabels.length > 0
      ? `&excludeLabels=${excludeLabels.join(',')}`
      : '';

  return `${TOKEN_END_POINT_API}/v3/tokens/trending?chainIds=${encodedChainIds}${queryParams.toString() ? `&${queryParams.toString()}` : ''}${excludeLabelsParam}`;
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
          Boolean(elm.aggregators.includes('lineaTeam')) ||
          elm.aggregators.length >= 3,
      );
    }
    return result;
  }
  return undefined;
}

export type TokenRwaData = {
  market?: {
    nextOpen?: string;
    nextClose?: string;
  };
  nextPause?: {
    start?: string;
    end?: string;
  };
  ticker?: string;
  instrumentType?: string;
};

export type TokenSearchItem = {
  assetId: CaipAssetType;
  name: string;
  symbol: string;
  decimals: number;
  /** Optional RWA data for tokens when includeRwaData is true */
  rwaData?: TokenRwaData;
};

type SearchTokenOptions = {
  limit?: number;
  includeMarketData?: boolean;
  includeRwaData?: boolean;
};

/**
 * Search for tokens across one or more networks by query string using CAIP format chain IDs.
 *
 * @param chainIds - Array of CAIP format chain IDs (e.g., ['eip155:1', 'eip155:137', 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp']).
 * @param query - The search query (token name, symbol, or address).
 * @param options - Additional fetch options.
 * @param options.limit - The maximum number of results to return.
 * @param options.includeMarketData - Optional flag to include market data in the results (defaults to false).
 * @param options.includeRwaData - Optional flag to include RWA data in the results (defaults to false).
 * @returns Object containing count, data array, and an optional error message if the request failed.
 */
export async function searchTokens(
  chainIds: CaipChainId[],
  query: string,
  {
    limit = 10,
    includeMarketData = false,
    includeRwaData = true,
  }: SearchTokenOptions = {},
): Promise<{ count: number; data: TokenSearchItem[]; error?: string }> {
  const tokenSearchURL = getTokenSearchURL({
    chainIds,
    query,
    limit,
    includeMarketData,
    includeRwaData,
  });

  try {
    const result: { count: number; data: TokenSearchItem[] } =
      await handleFetch(tokenSearchURL);

    // The API returns an object with structure: { count: number, data: array, pageInfo: object }
    if (result && typeof result === 'object' && Array.isArray(result.data)) {
      return {
        count: result.count ?? result.data.length,
        data: result.data,
      };
    }

    // Handle non-expected responses
    return { count: 0, data: [], error: 'Unexpected API response format' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { count: 0, data: [], error: errorMessage };
  }
}

/**
 * The trending asset type.
 */
export type TrendingAsset = {
  assetId: string;
  name: string;
  symbol: string;
  decimals: number;
  price: string;
  aggregatedUsdVolume: number;
  marketCap: number;
  priceChangePct?: {
    m5?: string;
    m15?: string;
    m30?: string;
    h1?: string;
    h6?: string;
    h24?: string;
  };
  labels?: string[];
  /** Optional RWA data for tokens when includeRwaData is true */
  rwaData?: TokenRwaData;
};

/**
 * Get the trending tokens for the given chains.
 *
 * @param options - Options for getting trending tokens.
 * @param options.chainIds - The chains to get the trending tokens for.
 * @param options.sortBy - The sort by field.
 * @param options.minLiquidity - The minimum liquidity.
 * @param options.minVolume24hUsd - The minimum volume 24h in USD.
 * @param options.maxVolume24hUsd - The maximum volume 24h in USD.
 * @param options.minMarketCap - The minimum market cap.
 * @param options.maxMarketCap - The maximum market cap.
 * @param options.excludeLabels - Array of labels to exclude (e.g., ['stable_coin', 'blue_chip']).
 * @param options.includeRwaData - Optional flag to include RWA data in the results (defaults to true).
 * @param options.usePriceApiData - Optional flag to use price API data in the results (defaults to true).
 * @returns The trending tokens.
 * @throws Will throw if the request fails.
 */
export async function getTrendingTokens({
  chainIds,
  sortBy,
  minLiquidity,
  minVolume24hUsd,
  maxVolume24hUsd,
  minMarketCap,
  maxMarketCap,
  excludeLabels,
  includeRwaData = true,
  usePriceApiData = true,
}: {
  chainIds: CaipChainId[];
  sortBy?: SortTrendingBy;
  minLiquidity?: number;
  minVolume24hUsd?: number;
  maxVolume24hUsd?: number;
  minMarketCap?: number;
  maxMarketCap?: number;
  excludeLabels?: string[];
  includeRwaData?: boolean;
  usePriceApiData?: boolean;
}): Promise<TrendingAsset[]> {
  if (chainIds.length === 0) {
    console.error('No chains provided');
    return [];
  }

  const trendingTokensURL = getTrendingTokensURL({
    chainIds,
    sort: sortBy,
    minLiquidity,
    minVolume24hUsd,
    maxVolume24hUsd,
    minMarketCap,
    maxMarketCap,
    excludeLabels,
    includeRwaData,
    usePriceApiData,
  });

  try {
    const result = await handleFetch(trendingTokensURL);

    // Validate that the API returned an array
    if (Array.isArray(result)) {
      return result;
    }

    // Handle non-expected responses
    console.error('Trending tokens API returned non-array response:', result);
    return [];
  } catch (error) {
    console.error('Trending tokens request failed:', error);
    return [];
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
export async function fetchTokenMetadata<TReturn>(
  chainId: Hex,
  tokenAddress: string,
  abortSignal: AbortSignal,
  { timeout = defaultTimeout } = {},
): Promise<TReturn | undefined> {
  if (!isTokenListSupportedForNetwork(chainId)) {
    throw new Error(TOKEN_METADATA_NO_SUPPORT_ERROR);
  }
  const tokenMetadataURL = getTokenMetadataURL(chainId, tokenAddress);
  const response = await queryApi(tokenMetadataURL, abortSignal, timeout);
  if (response) {
    return parseJsonResponse(response) as Promise<TReturn>;
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
    headers: {
      'Content-Type': 'application/json',
    },
  };
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
    throw new Error(`TokenService Error: ${responseObj.error}`);
  }
  return responseObj;
}
