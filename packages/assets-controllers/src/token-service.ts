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
    chainId === ChainId['megaeth-mainnet'] ||
    chainId === '0x1079' // Tempo Mainnet
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
 * @param options.after - Optional cursor for fetching the next page of results.
 * @param options.includeMarketData - Optional flag to include market data in the results (defaults to false).
 * @param options.includeRwaData - Optional flag to include RWA data in the results (defaults to false).
 * @param options.includeTokenSecurityData - Optional flag to include token security data in the results (defaults to false).
 * @returns The token search URL.
 */
function getTokenSearchURL(options: {
  chainIds: CaipChainId[];
  query: string;
  limit?: number;
  after?: string;
  includeMarketData?: boolean;
  includeRwaData?: boolean;
  includeTokenSecurityData?: boolean;
}): string {
  const { chainIds, query, limit, after, ...optionalParams } = options;
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

  return `${TOKEN_END_POINT_API}/tokens/search?networks=${encodedChainIds}&query=${encodedQuery}${numberOfItems ? `&first=${numberOfItems}` : ''}${after ? `&after=${encodeURIComponent(after)}` : ''}&${queryParams.toString()}`;
}

/**
 * Get the token assets URL for the given asset IDs.
 *
 * @param options - Options for getting token assets.
 * @param options.assetIds - Array of CAIP-19 asset IDs (e.g., ['eip155:1/erc20:0x...', 'solana:5eykt.../slip44:501']).
 * @param options.includeAggregators - Optional flag to include aggregator list in the results (defaults to false).
 * @param options.includeCoingeckoId - Optional flag to include CoinGecko ID in the results (defaults to false).
 * @param options.includeLabels - Optional flag to include labels in the results (defaults to false).
 * @param options.includeMarketData - Optional flag to include market data in the results (defaults to false).
 * @param options.includeOccurrences - Optional flag to include occurrence count in the results (defaults to false).
 * @param options.includeTokenSecurityData - Optional flag to include token security data in the results (defaults to false).
 * @param options.includeRwaData - Optional flag to include RWA data in the results (defaults to false).
 * @returns The token assets URL.
 */
function getTokenAssetsURL(options: {
  assetIds: CaipAssetType[];
  includeAggregators?: boolean;
  includeCoingeckoId?: boolean;
  includeLabels?: boolean;
  includeMarketData?: boolean;
  includeOccurrences?: boolean;
  includeTokenSecurityData?: boolean;
  includeRwaData?: boolean;
}): string {
  const { assetIds, ...queryOptions } = options;
  const encodedAssetIds = assetIds
    .map((id) => encodeURIComponent(id))
    .join(',');
  const queryParams = new URLSearchParams();
  Object.entries(queryOptions).forEach(([key, value]) => {
    if (value !== undefined) {
      queryParams.append(key, String(value));
    }
  });
  return `${TOKEN_END_POINT_API}/assets?assetIds=${encodedAssetIds}${queryParams.toString() ? `&${queryParams.toString()}` : ''}`;
}

/**
 * Get the RWAs URL for the given query params.
 *
 * @param options - Options for getting RWAs.
 * @returns The RWAs URL.
 */
function getRwasURL(options: FetchRwasParams): string {
  const {
    chainIds,
    query: searchQuery,
    active,
    custodian,
    type,
    industry,
    sortBy,
    limit = 100,
    after,
    ...additionalParams
  } = options;
  const trimmedSearchQuery = searchQuery?.trim();
  const queryParams = new URLSearchParams();

  Object.entries({
    ...(chainIds?.length ? { chainIds } : {}),
    ...(trimmedSearchQuery && { query: trimmedSearchQuery }),
    ...(active === undefined ? {} : { active }),
    ...(custodian && { custodian }),
    ...(type && { type }),
    ...(industry && { industry }),
    ...(sortBy && { sortBy }),
    limit,
    ...(after && { after }),
    ...additionalParams,
  }).forEach(([key, value]) => {
    if (value === undefined || value === '') {
      return;
    }

    if (Array.isArray(value)) {
      if (value.length > 0) {
        queryParams.append(key, value.join(','));
      }
      return;
    }

    queryParams.append(key, String(value));
  });

  return `${TOKEN_END_POINT_API}/v1/rwas?${queryParams.toString()}`;
}

/**
 * Shared query-parameter type for the v3 trending tokens endpoint.
 *
 * Known parameters are explicitly typed for autocomplete and documentation.
 * The index signature allows new API parameters to pass through without
 * requiring a core release — callers can add any additional key/value and
 * it will be forwarded as a query parameter.
 */
export type TrendingTokensQueryParams = {
  sort?: SortTrendingBy;
  minLiquidity?: number;
  minVolume24hUsd?: number;
  maxVolume24hUsd?: number;
  minMarketCap?: number;
  maxMarketCap?: number;
  excludeLabels?: string[];
  includeRwaData?: boolean;
  usePriceApiData?: boolean;
  includeTokenSecurityData?: boolean;
  [key: string]: string | number | boolean | string[] | undefined;
};

/**
 * Get the trending tokens URL for the given networks and search query.
 *
 * @param options - Options bag: `chainIds` (required) plus any query params.
 * @returns The trending tokens URL.
 */
function getTrendingTokensURL(
  options: { chainIds: CaipChainId[] } & TrendingTokensQueryParams,
): string {
  const encodedChainIds = options.chainIds
    .map((id) => encodeURIComponent(id))
    .join(',');
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

export type RwaMarket = {
  nextOpen?: string;
  nextClose?: string;
};

export type RwaTokenData = {
  price: string;
  priceChange: string;
  marketCap: number;
  aggregatedUsdVolume: number;
  active: boolean;
  ticker: string;
  instrumentType: string;
  custodians: string[];
  industry: string[];
  market?: RwaMarket;
  nextPause?: Record<string, unknown>;
  sharesOutstanding?: number;
  restrictedCountries?: string[];
  updatedAt?: string;
  addressType?: string;
};

export type RwaToken = {
  id: string;
  assetId: CaipAssetType;
  symbol: string;
  decimals: number;
  name: string;
  rwaData: RwaTokenData;
};

export type RwasResponse = {
  data: RwaToken[];
  count: number;
  totalCount: number;
  pageInfo: {
    nextCursor: string | null;
    hasNextPage: boolean;
  };
};

export type RwaSortBy =
  | 'price_change_asc'
  | 'price_change_desc'
  | 'volume_asc'
  | 'volume_desc'
  | 'market_cap_asc'
  | 'market_cap_desc';

export type FetchRwasParams = {
  chainIds?: CaipChainId[];
  query?: string;
  sortBy?: RwaSortBy;
  limit?: number;
  after?: string;
  active?: boolean;
  custodian?: 'ondo';
  type?: 'stock' | 'etf';
  industry?:
    | 'industrials'
    | 'technology'
    | 'healthcare'
    | 'consumer discretionary'
    | 'financials'
    | 'materials'
    | 'utilities'
    | 'energy'
    | 'real estate';
  [key: string]: string | number | boolean | string[] | undefined;
};

export type TokenSecurityFeature = {
  featureId: string;
  type: string;
  description: string;
};

export type TokenSecurityHolder = {
  label: string;
  name: string | null;
  address: string;
  holdingPercentage: number;
};

export type TokenSecurityMarket = {
  marketType: string;
  marketName: string;
  pairName: string;
  reserveUSD: number;
};

export type TokenSecurityFees = {
  transfer: number;
  transferFeeMaxAmount: number | null;
  buy: number;
  sell: number | null;
};

export type TokenSecurityFinancialStats = {
  supply: number;
  topHolders: TokenSecurityHolder[];
  holdersCount: number;
  tradeVolume24h: number | null;
  lockedLiquidityPct: number | null;
  markets: TokenSecurityMarket[];
};

export type TokenSecurityMetadata = {
  externalLinks: {
    homepage: string | null;
    twitterPage: string | null;
    telegramChannelId: string | null;
  };
};

export type TokenSecurityData = {
  resultType: string;
  maliciousScore: string;
  fees: TokenSecurityFees;
  features: TokenSecurityFeature[];
  financialStats: TokenSecurityFinancialStats;
  metadata: TokenSecurityMetadata;
  created: string;
};

export type TokenSearchItem = {
  assetId: CaipAssetType;
  name: string;
  symbol: string;
  decimals: number;
  /** Optional RWA data for tokens when includeRwaData is true */
  rwaData?: TokenRwaData;
  /** Optional security data for tokens when includeTokenSecurityData is true */
  securityData?: TokenSecurityData;
};

export type PageInfo = {
  hasNextPage: boolean;
  endCursor: string | null;
};

type SearchTokenOptions = {
  limit?: number;
  /** Cursor returned by a previous response's `pageInfo.endCursor` to fetch the next page. */
  after?: string;
  includeMarketData?: boolean;
  includeRwaData?: boolean;
  includeTokenSecurityData?: boolean;
};

/**
 * Search for tokens across one or more networks by query string using CAIP format chain IDs.
 *
 * @param chainIds - Array of CAIP format chain IDs (e.g., ['eip155:1', 'eip155:137', 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp']).
 * @param query - The search query (token name, symbol, or address).
 * @param options - Additional fetch options.
 * @param options.limit - The maximum number of results to return.
 * @param options.after - Cursor from a previous response's `pageInfo.endCursor` to fetch the next page.
 * @param options.includeMarketData - Optional flag to include market data in the results (defaults to false).
 * @param options.includeRwaData - Optional flag to include RWA data in the results (defaults to false).
 * @param options.includeTokenSecurityData - Optional flag to include token security data in the results (defaults to false).
 * @returns Object containing count, totalCount, data array, optional pageInfo for pagination, and an optional error message if the request failed.
 */
export async function searchTokens(
  chainIds: CaipChainId[],
  query: string,
  {
    limit = 10,
    after,
    includeMarketData = false,
    includeRwaData = true,
    includeTokenSecurityData,
  }: SearchTokenOptions = {},
): Promise<{
  count: number;
  totalCount?: number;
  data: TokenSearchItem[];
  pageInfo?: PageInfo;
  error?: string;
}> {
  const tokenSearchURL = getTokenSearchURL({
    chainIds,
    query,
    limit,
    after,
    includeMarketData,
    includeRwaData,
    includeTokenSecurityData,
  });

  try {
    const result: {
      count: number;
      totalCount?: number;
      data: TokenSearchItem[];
      pageInfo?: PageInfo;
    } = await handleFetch(tokenSearchURL);

    if (result && typeof result === 'object' && Array.isArray(result.data)) {
      return {
        count: result.count ?? result.data.length,
        ...(result.totalCount !== undefined && {
          totalCount: result.totalCount,
        }),
        data: result.data,
        ...(result.pageInfo !== undefined && { pageInfo: result.pageInfo }),
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
  /** Optional security data for tokens when includeTokenSecurityData is true */
  securityData?: TokenSecurityData;
};

/**
 * Get the trending tokens for the given chains.
 *
 * Accepts all known query parameters plus any additional ones via the
 * index signature on {@link TrendingTokensQueryParams}. New API parameters
 * can be passed without updating this function.
 *
 * @param options - Options bag: `chainIds` (required) plus any query params
 *   supported by the v3 trending endpoint.
 * @returns The trending tokens.
 * @throws Will throw if the request fails.
 */
export async function getTrendingTokens(
  options: { chainIds: CaipChainId[] } & TrendingTokensQueryParams,
): Promise<TrendingAsset[]> {
  const { chainIds, ...rest } = options;

  if (chainIds.length === 0) {
    console.error('No chains provided');
    return [];
  }

  const trendingTokensURL = getTrendingTokensURL({
    chainIds,
    ...rest,
    includeRwaData: rest.includeRwaData ?? true,
    usePriceApiData: rest.usePriceApiData ?? true,
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
 * The token asset type returned by the /assets endpoint.
 */
export type TokenAsset = {
  assetId: CaipAssetType;
  name: string;
  symbol: string;
  decimals: number;
  /** Aggregator list when includeAggregators is true */
  aggregators?: string[];
  /** CoinGecko ID when includeCoingeckoId is true */
  coingeckoId?: string;
  /** Labels when includeLabels is true */
  labels?: string[];
  /** Occurrence count when includeOccurrences is true */
  occurrences?: number;
  /** RWA data when includeRwaData is true */
  rwaData?: TokenRwaData;
  /** Security data when includeTokenSecurityData is true */
  securityData?: TokenSecurityData;
};

type FetchTokenAssetsOptions = {
  includeAggregators?: boolean;
  includeCoingeckoId?: boolean;
  includeLabels?: boolean;
  includeMarketData?: boolean;
  includeOccurrences?: boolean;
  includeTokenSecurityData?: boolean;
  includeRwaData?: boolean;
};

/**
 * Fetch asset metadata for the given CAIP-19 asset IDs.
 *
 * @param assetIds - Array of CAIP-19 asset IDs (e.g., ['eip155:1/erc20:0x...', 'solana:5eykt.../slip44:501']).
 * @param options - Additional fetch options.
 * @param options.includeAggregators - Optional flag to include aggregator list in the results (defaults to false).
 * @param options.includeCoingeckoId - Optional flag to include CoinGecko ID in the results (defaults to false).
 * @param options.includeLabels - Optional flag to include labels in the results (defaults to false).
 * @param options.includeMarketData - Optional flag to include market data in the results (defaults to false).
 * @param options.includeOccurrences - Optional flag to include occurrence count in the results (defaults to false).
 * @param options.includeTokenSecurityData - Optional flag to include token security data in the results (defaults to false).
 * @param options.includeRwaData - Optional flag to include RWA data in the results (defaults to false).
 * @returns Array of token assets, or empty array if the request failed or no IDs were provided.
 */
export async function fetchTokenAssets(
  assetIds: CaipAssetType[],
  {
    includeAggregators,
    includeCoingeckoId,
    includeLabels,
    includeMarketData,
    includeOccurrences,
    includeTokenSecurityData,
    includeRwaData,
  }: FetchTokenAssetsOptions = {},
): Promise<TokenAsset[]> {
  if (assetIds.length === 0) {
    return [];
  }

  const tokenAssetsURL = getTokenAssetsURL({
    assetIds,
    includeAggregators,
    includeCoingeckoId,
    includeLabels,
    includeMarketData,
    includeOccurrences,
    includeTokenSecurityData,
    includeRwaData,
  });

  try {
    const result = await handleFetch(tokenAssetsURL);

    if (Array.isArray(result)) {
      return result;
    }

    return [];
  } catch {
    return [];
  }
}

/**
 * Fetch real-world asset tokens.
 *
 * @param params - Query params used to filter, sort, and paginate RWAs.
 * @returns The paginated RWA response.
 */
export async function fetchRwas(
  params: FetchRwasParams = {},
): Promise<RwasResponse> {
  return handleFetch(getRwasURL(params), { headers: { accept: '*/*' } });
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
