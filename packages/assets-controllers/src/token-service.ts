import {
  ChainId,
  convertHexToDecimal,
  handleFetch,
  timeoutFetch,
} from '@metamask/controller-utils';
import {
  CaipAssetType,
  CaipChainId,
  Hex,
  KnownCaipNamespace,
  toCaipAssetType,
  toCaipChainId,
  parseCaipChainId,
  hexToNumber,
} from '@metamask/utils';

import {
  formatIconUrlWithProxy,
  isTokenListSupportedForNetwork,
} from './assetsUtil';

export const TOKEN_END_POINT_API = 'https://token.api.cx.metamask.io';
export const TOKENS_END_POINT_API = 'https://tokens.api.cx.metamask.io';
export const TOKEN_METADATA_NO_SUPPORT_ERROR =
  'TokenService Error: Network does not support fetchTokenMetadata';

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

export type GetTokensUrlResponse = {
  data: {
    address: string;
    symbol: string;
    decimals: number;
    name: string;
    aggregators: string[];
    occurrences: number;
    iconUrl?: string;
    rwaData?: TokenRwaData;
  }[];
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string;
  };
};

export type GetTokenMetadataUrlResponse = {
  assetId: CaipAssetType;
  symbol: string;
  decimals: number;
  name: string;
  aggregators: string[];
  rwaData?: TokenRwaData;
}[];

export type EVMTokenMetadata = {
  name: string;
  symbol: string;
  decimals: number;
  address: string;
  aggregators: string[];
  occurrences: number;
  iconUrl: string;
  rwaData?: TokenRwaData;
};

/**
 * Get the tokens URL for a specific network.
 *
 * @param chainId - The chain ID of the network the tokens requested are on.
 * @param nextCursor - The cursor to the next page of tokens.
 * @returns The tokens URL.
 */
function getTokensURL(chainId: Hex, nextCursor?: string): string {
  const occurrenceFloor = chainId === ChainId['linea-mainnet'] ? 1 : 3;

  const queryParams = new URLSearchParams();
  queryParams.append('occurrenceFloor', occurrenceFloor.toString());
  queryParams.append('includeTokenFees', 'false');
  queryParams.append('includeAssetType', 'false');
  queryParams.append('includeERC20Permit', 'false');
  queryParams.append('includeStorage', 'false');
  queryParams.append('includeAggregators', 'true');
  queryParams.append('includeOccurrences', 'true');
  queryParams.append('includeIconUrl', 'true');
  queryParams.append('includeRwaData', 'true');
  queryParams.append('first', '3000');
  if (nextCursor) {
    queryParams.append('after', nextCursor);
  }

  return `${TOKENS_END_POINT_API}/tokens/${convertHexToDecimal(
    chainId,
  )}?${queryParams.toString()}`;
}

console.log('getTokensURL', getTokensURL(ChainId.mainnet));

/**
 * Get the token metadata URL for the given network and token.
 *
 * @param chainId - The chain ID of the network the token is on.
 * @param tokenAddress - The token address.
 * @returns The token metadata URL.
 */
function getTokenMetadataURL(chainId: Hex, tokenAddress: string): string {
  const queryParams = new URLSearchParams();
  const caipChainId = parseCaipChainId(
    toCaipChainId(KnownCaipNamespace.Eip155, hexToNumber(chainId).toString()),
  );
  const assetId = toCaipAssetType(
    caipChainId.namespace,
    caipChainId.reference,
    'erc20',
    tokenAddress,
  );

  queryParams.append('includeAggregators', 'true');
  queryParams.append('includeOccurrences', 'true');
  queryParams.append('includeIconUrl', 'true');
  queryParams.append('includeMetadata', 'true');
  queryParams.append('includeRwaData', 'true');

  return `${TOKENS_END_POINT_API}/v3/assets?assetIds=${assetId}&${queryParams.toString()}`;
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
  const { chainIds, query, ...optionalParams } = options;
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
  return `${TOKEN_END_POINT_API}/tokens/search?networks=${encodedChainIds}&query=${encodedQuery}&${queryParams.toString()}`;
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
): Promise<GetTokensUrlResponse['data']> {
  // TODO: We really need to move away from fetching all tokens at once
  // This is expensive - uses up a lot of memory and bandwidth
  // Need to discuss how we can fully deprecate this - many areas require this metadata (decimals, icon, rwaData)
  const allTokens: GetTokensUrlResponse['data'] = [];
  let nextCursor: string | undefined;

  // If we are still fetching tokens past 10 pages of 3000 tokens (30000),
  // then we really need to re-evaluate our approach
  const hardPaginationLimit = 10;
  let paginationCount = 0;

  do {
    const tokenURL = getTokensURL(chainId, nextCursor);
    const response = await queryApi(tokenURL, abortSignal, timeout);
    if (!response) {
      break;
    }

    const result = await parseJsonResponse(response);

    if (
      result &&
      typeof result === 'object' &&
      'data' in result &&
      Array.isArray(result.data)
    ) {
      const typedResult = result as GetTokensUrlResponse;

      allTokens.push(...typedResult.data);

      nextCursor = typedResult?.pageInfo?.hasNextPage
        ? typedResult?.pageInfo?.endCursor
        : undefined;
    }
    paginationCount += 1;
  } while (nextCursor && paginationCount < hardPaginationLimit);

  if (paginationCount >= hardPaginationLimit) {
    console.warn(
      `TokenService: Token list pagination limit reached for chainId ${chainId}`,
    );
    return allTokens;
  }

  if (chainId === ChainId['linea-mainnet']) {
    return allTokens.filter(
      (elm) =>
        Boolean(elm.aggregators?.includes('lineaTeam')) ||
        (elm.aggregators && elm.aggregators.length >= 3),
    );
  }

  return allTokens;
}

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
 * @returns Object containing count and data array. Returns { count: 0, data: [] } if request fails.
 */
export async function searchTokens(
  chainIds: CaipChainId[],
  query: string,
  {
    limit = 10,
    includeMarketData = false,
    includeRwaData,
  }: SearchTokenOptions = {},
): Promise<{ count: number; data: TokenSearchItem[] }> {
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
        count: result.count || result.data.length,
        data: result.data,
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
 * @param options.includeRwaData - Optional flag to include RWA data in the results (defaults to false).
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
  includeRwaData,
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
export async function fetchTokenMetadata(
  chainId: Hex,
  tokenAddress: string,
  abortSignal: AbortSignal,
  { timeout = defaultTimeout } = {},
): Promise<EVMTokenMetadata | undefined> {
  if (!isTokenListSupportedForNetwork(chainId)) {
    throw new Error(TOKEN_METADATA_NO_SUPPORT_ERROR);
  }
  const tokenMetadataURL = getTokenMetadataURL(chainId, tokenAddress);
  const response = await queryApi(tokenMetadataURL, abortSignal, timeout);
  if (!response) {
    return undefined;
  }

  const result = await parseJsonResponse(response);
  if (!result || !Array.isArray(result)) {
    return undefined;
  }

  const typedResult = result as GetTokenMetadataUrlResponse;
  const singleToken = typedResult.at(0);
  if (!singleToken) {
    return undefined;
  }

  const tokenMetadata: EVMTokenMetadata = {
    name: singleToken.name,
    symbol: singleToken.symbol,
    decimals: singleToken.decimals,
    address: tokenAddress,
    aggregators: singleToken.aggregators,
    occurrences: singleToken.aggregators?.length ?? 0,
    iconUrl: formatIconUrlWithProxy({
      chainId,
      tokenAddress,
    }),
    rwaData: singleToken.rwaData,
  };

  return tokenMetadata;
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
