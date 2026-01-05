/**
 * ApiPlatformClient - MetaMask API Platform Client
 *
 * A comprehensive API client that uses @tanstack/query-core directly for:
 * - Automatic request deduplication
 * - Intelligent caching
 * - Automatic retries with exponential backoff
 *
 * Provides unified access to all MetaMask backend APIs:
 * - Accounts API (accounts.api.cx.metamask.io)
 * - Price API (price.api.cx.metamask.io)
 * - Token API (token.api.cx.metamask.io)
 * - Tokens API (tokens.api.cx.metamask.io)
 *
 * @example
 * ```typescript
 * const client = new ApiPlatformClient({
 *   clientProduct: 'metamask-extension',
 *   getBearerToken: async () => token,
 * });
 *
 * // Fetch with caching
 * const networks = await client.fetchV2SupportedNetworks();
 * const balances = await client.fetchV5MultiAccountBalances(accountIds);
 * const prices = await client.fetchV3SpotPrices(assetIds);
 *
 * // Invalidate cache
 * await client.invalidateBalances();
 * ```
 */

import { QueryClient } from '@tanstack/query-core';
import type { QueryKey } from '@tanstack/query-core';

import type {
  SupportedCurrency,
  MarketDataDetails,
  TokenMetadata,
  TrendingToken,
  GetHistoricalPricesResponse,
  AccountRelationshipResult,
  PageInfo,
} from './api-types';

// ============================================================================
// CONSTANTS
// ============================================================================

/** API Base URLs */
export const API_URLS = {
  ACCOUNTS: 'https://accounts.api.cx.metamask.io',
  PRICES: 'https://price.api.cx.metamask.io',
  TOKEN: 'https://token.api.cx.metamask.io',
  TOKENS: 'https://tokens.api.cx.metamask.io',
} as const;

/** Stale times for different data types (ms) */
export const STALE_TIMES = {
  AUTH_TOKEN: 5 * 60 * 1000, // 5 minutes - cache the auth token
  PRICES: 30 * 1000, // 30 seconds
  BALANCES: 60 * 1000, // 1 minute
  NETWORKS: 10 * 60 * 1000, // 10 minutes
  SUPPORTED_NETWORKS: 30 * 60 * 1000, // 30 minutes
  TOKEN_METADATA: 5 * 60 * 1000, // 5 minutes
  TOKEN_LIST: 10 * 60 * 1000, // 10 minutes
  EXCHANGE_RATES: 5 * 60 * 1000, // 5 minutes
  TRENDING: 2 * 60 * 1000, // 2 minutes
  TRANSACTIONS: 30 * 1000, // 30 seconds
  DEFAULT: 30 * 1000, // 30 seconds
} as const;

/** Garbage collection times (ms) */
export const GC_TIMES = {
  DEFAULT: 5 * 60 * 1000, // 5 minutes
  EXTENDED: 30 * 60 * 1000, // 30 minutes
  SHORT: 2 * 60 * 1000, // 2 minutes
} as const;

/** Retry configuration */
const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  BASE_DELAY: 1000,
  MAX_DELAY: 30_000,
} as const;

// ============================================================================
// QUERY KEYS
// ============================================================================

export const queryKeys = {
  auth: {
    bearerToken: (): QueryKey => ['auth', 'bearerToken'],
  },
  accounts: {
    all: ['accounts'] as const,
    // Supported Networks
    v1SupportedNetworks: (): QueryKey => ['accounts', 'v1SupportedNetworks'],
    v2SupportedNetworks: (): QueryKey => ['accounts', 'v2SupportedNetworks'],
    // Active Networks
    v2ActiveNetworks: (
      accountIds: string[],
      options?: { networks?: string[] },
    ): QueryKey => [
      'accounts',
      'v2ActiveNetworks',
      { accountIds: accountIds.sort(), options },
    ],
    // Balances
    balances: {
      all: ['accounts', 'balances'] as const,
      v2: (address: string, options?: { networks?: number[] }): QueryKey => [
        'accounts',
        'balances',
        'v2',
        { address, options },
      ],
      v4: (
        accountAddresses: string[],
        options?: { networks?: number[] },
      ): QueryKey => [
        'accounts',
        'balances',
        'v4',
        { accountAddresses: accountAddresses.sort(), options },
      ],
      v5: (
        accountIds: string[],
        options?: { networks?: string[] },
      ): QueryKey => [
        'accounts',
        'balances',
        'v5',
        { accountIds: accountIds.sort(), options },
      ],
    },
    // Transactions
    transactions: {
      all: ['accounts', 'transactions'] as const,
      v1ByHash: (chainId: number, txHash: string): QueryKey => [
        'accounts',
        'transactions',
        'v1ByHash',
        chainId,
        txHash,
      ],
      v1Account: (
        address: string,
        options?: { chainIds?: string[]; cursor?: string },
      ): QueryKey => [
        'accounts',
        'transactions',
        'v1Account',
        { address, options },
      ],
      v4MultiAccount: (
        accountIds: string[],
        options?: { networks?: string[]; cursor?: string },
      ): QueryKey => [
        'accounts',
        'transactions',
        'v4MultiAccount',
        { accountIds: accountIds.sort(), options },
      ],
    },
    // Relationships
    v1Relationship: (chainId: number, from: string, to: string): QueryKey => [
      'accounts',
      'v1Relationship',
      chainId,
      from,
      to,
    ],
    // NFTs
    v2Nfts: (
      address: string,
      options?: { networks?: number[]; cursor?: string },
    ): QueryKey => ['accounts', 'v2Nfts', { address, options }],
    // Tokens
    v2Tokens: (
      address: string,
      options?: { networks?: number[] },
    ): QueryKey => ['accounts', 'v2Tokens', { address, options }],
  },
  prices: {
    all: ['prices'] as const,
    // Supported Networks
    v1SupportedNetworks: (): QueryKey => ['prices', 'v1SupportedNetworks'],
    v2SupportedNetworks: (): QueryKey => ['prices', 'v2SupportedNetworks'],
    // Exchange Rates
    v1ExchangeRates: (baseCurrency: string): QueryKey => [
      'prices',
      'v1ExchangeRates',
      baseCurrency,
    ],
    v1FiatExchangeRates: (): QueryKey => ['prices', 'v1FiatExchangeRates'],
    v1CryptoExchangeRates: (): QueryKey => ['prices', 'v1CryptoExchangeRates'],
    // Spot Prices - CoinGecko ID based
    v1SpotPricesByCoinIds: (coinIds: string[]): QueryKey => [
      'prices',
      'v1SpotPricesByCoinIds',
      { coinIds: coinIds.sort() },
    ],
    v1SpotPriceByCoinId: (coinId: string, currency: string): QueryKey => [
      'prices',
      'v1SpotPriceByCoinId',
      coinId,
      currency,
    ],
    // Spot Prices - Token Address based
    v1TokenPrices: (
      chainId: string,
      tokenAddresses: string[],
      currency?: string,
    ): QueryKey => [
      'prices',
      'v1TokenPrices',
      { chainId, tokenAddresses: tokenAddresses.sort(), currency },
    ],
    v1TokenPrice: (
      chainId: string,
      tokenAddress: string,
      currency: string,
    ): QueryKey => ['prices', 'v1TokenPrice', chainId, tokenAddress, currency],
    // V2 Spot Prices
    v2SpotPrices: (
      chainId: string,
      tokenAddresses: string[],
      currency?: string,
    ): QueryKey => [
      'prices',
      'v2SpotPrices',
      { chainId, tokenAddresses: tokenAddresses.sort(), currency },
    ],
    // V3 Spot Prices
    v3SpotPrices: (
      assetIds: string[],
      currency?: string,
      includeMarketData?: boolean,
    ): QueryKey => [
      'prices',
      'v3SpotPrices',
      { assetIds: assetIds.sort(), currency, includeMarketData },
    ],
    // Historical Prices
    v1HistoricalByCoinId: (
      coinId: string,
      options?: { currency?: string; timePeriod?: string },
    ): QueryKey => ['prices', 'v1HistoricalByCoinId', coinId, options],
    v1HistoricalByTokenAddresses: (
      chainId: string,
      tokenAddresses: string[],
      options?: { currency?: string; timePeriod?: string },
    ): QueryKey => [
      'prices',
      'v1HistoricalByTokenAddresses',
      { chainId, tokenAddresses: tokenAddresses.sort(), options },
    ],
    v1Historical: (
      chainId: string,
      tokenAddress: string,
      currency: string,
      timeRange: string,
    ): QueryKey => [
      'prices',
      'v1Historical',
      chainId,
      tokenAddress,
      currency,
      timeRange,
    ],
    v3Historical: (
      chainId: string,
      assetType: string,
      options?: { currency?: string; timePeriod?: string },
    ): QueryKey => ['prices', 'v3Historical', chainId, assetType, options],
    // Price Graph
    v1GraphByCoinId: (
      coinId: string,
      currency: string,
      includeOHLC: boolean,
    ): QueryKey => ['prices', 'v1GraphByCoinId', coinId, currency, includeOHLC],
    v1GraphByTokenAddress: (
      chainId: string,
      tokenAddress: string,
      currency: string,
      includeOHLC: boolean,
    ): QueryKey => [
      'prices',
      'v1GraphByTokenAddress',
      chainId,
      tokenAddress,
      currency,
      includeOHLC,
    ],
  },
  tokens: {
    all: ['tokens'] as const,
    // Supported Networks
    v1SupportedNetworks: (): QueryKey => ['tokens', 'v1SupportedNetworks'],
    v2SupportedNetworks: (): QueryKey => ['tokens', 'v2SupportedNetworks'],
    // Networks
    networks: (): QueryKey => ['tokens', 'networks'],
    networkByChainId: (chainId: number): QueryKey => [
      'tokens',
      'networkByChainId',
      chainId,
    ],
    // Token List
    tokenList: (chainId: number): QueryKey => ['tokens', 'tokenList', chainId],
    // Token Metadata
    v1Metadata: (chainId: number, tokenAddress: string): QueryKey => [
      'tokens',
      'v1Metadata',
      chainId,
      tokenAddress,
    ],
    tokenDescription: (chainId: number, tokenAddress: string): QueryKey => [
      'tokens',
      'tokenDescription',
      chainId,
      tokenAddress,
    ],
    // Trending & Top Tokens
    v3Trending: (chainIds: string[], sortBy?: string): QueryKey => [
      'tokens',
      'v3Trending',
      { chainIds: chainIds.sort(), sortBy },
    ],
    v3TopGainers: (chainIds: string[], sort?: string): QueryKey => [
      'tokens',
      'v3TopGainers',
      { chainIds: chainIds.sort(), sort },
    ],
    v3Popular: (chainIds: string[]): QueryKey => [
      'tokens',
      'v3Popular',
      { chainIds: chainIds.sort() },
    ],
    // Top Assets
    topAssets: (chainId: number): QueryKey => ['tokens', 'topAssets', chainId],
    // Utility
    v1SuggestedOccurrenceFloors: (): QueryKey => [
      'tokens',
      'v1SuggestedOccurrenceFloors',
    ],
    // V3 Assets
    v3Assets: (assetIds: string[]): QueryKey => [
      'tokens',
      'v3Assets',
      { assetIds: assetIds.sort() },
    ],
  },
} as const;

// ============================================================================
// TYPES
// ============================================================================

export type ApiPlatformClientOptions = {
  /** Client product identifier (e.g., 'metamask-extension') */
  clientProduct: string;
  /** Optional client version */
  clientVersion?: string;
  /** Function to get bearer token for authenticated requests */
  getBearerToken?: () => Promise<string | undefined>;
  /** Optional custom QueryClient instance */
  queryClient?: QueryClient;
};

export type FetchOptions = {
  /** Custom stale time (ms) */
  staleTime?: number;
  /** Custom GC time (ms) */
  gcTime?: number;
  /** Abort signal */
  signal?: AbortSignal;
};

// ============================================================================
// ACCOUNTS API TYPES
// ============================================================================

/** V5 Balance Item from Accounts API */
export type V5BalanceItem = {
  object: 'token';
  symbol: string;
  name: string;
  type: 'native' | 'erc20';
  decimals: number;
  assetId: string;
  balance: string;
  accountId: string;
};

/** V5 Multi-account balances response */
export type V5BalancesResponse = {
  count: number;
  unprocessedNetworks: string[];
  balances: V5BalanceItem[];
};

/** V2 Balance item */
export type V2BalanceItem = {
  object: string;
  type?: string;
  timestamp?: string;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  chainId: number;
  balance: string;
  accountAddress?: string;
};

/** V2 Balances response */
export type V2BalancesResponse = {
  count: number;
  balances: V2BalanceItem[];
  unprocessedNetworks: number[];
};

/** V4 Multi-account balances response */
export type V4BalancesResponse = {
  count: number;
  balances: V2BalanceItem[];
  unprocessedNetworks: number[];
};

/** V1 Supported networks response */
export type V1SupportedNetworksResponse = {
  supportedNetworks: number[];
};

/** V2 Supported networks response */
export type V2SupportedNetworksResponse = {
  fullSupport: number[];
  partialSupport: {
    balances: number[];
  };
};

/** Active networks response */
export type ActiveNetworksResponse = {
  activeNetworks: string[];
};

/** Transaction by hash response */
export type TransactionByHashResponse = {
  hash: string;
  timestamp: string;
  chainId: number;
  blockNumber: number;
  blockHash: string;
  gas: number;
  gasUsed: number;
  gasPrice: string;
  effectiveGasPrice: number;
  nonce: number;
  cumulativeGasUsed: number;
  methodId?: string;
  value: string;
  to: string;
  from: string;
  isError?: boolean;
  valueTransfers?: {
    from: string;
    to: string;
    amount: string;
    decimal: number;
    contractAddress: string;
    symbol: string;
    name: string;
    transferType: string;
  }[];
  logs?: {
    data: string;
    topics: string[];
    address: string;
    logIndex: number;
  }[];
  transactionType?: string;
  transactionCategory?: string;
  transactionProtocol?: string;
};

/** Account transactions response */
export type AccountTransactionsResponse = {
  data: TransactionByHashResponse[];
  pageInfo: PageInfo;
};

/** V4 Multi-account transactions response */
export type V4MultiAccountTransactionsResponse = {
  unprocessedNetworks: string[];
  pageInfo: {
    count: number;
    hasNextPage: boolean;
    endCursor?: string;
  };
  data: TransactionByHashResponse[];
};

/** NFT item */
export type NftItem = {
  tokenId: string;
  contractAddress: string;
  chainId: number;
  name?: string;
  description?: string;
  imageUrl?: string;
  attributes?: Record<string, unknown>[];
};

/** NFTs response */
export type NftsResponse = {
  data: NftItem[];
  pageInfo: PageInfo;
};

/** Token discovery item */
export type TokenDiscoveryItem = {
  address: string;
  chainId: number;
  symbol: string;
  name: string;
  decimals: number;
  balance?: string;
};

/** Tokens response */
export type TokensResponse = {
  data: TokenDiscoveryItem[];
};

// ============================================================================
// PRICES API TYPES
// ============================================================================

/** V3 Spot prices response */
export type V3SpotPricesResponse = Record<
  string,
  {
    price: number;
    pricePercentChange1d?: number;
    marketCap?: number;
    totalVolume?: number;
  } | null
>;

/** CoinGecko spot price */
export type CoinGeckoSpotPrice = {
  id: string;
  price: number;
  marketCap?: number;
  allTimeHigh?: number;
  allTimeLow?: number;
  totalVolume?: number;
  high1d?: number;
  low1d?: number;
  circulatingSupply?: number;
  dilutedMarketCap?: number;
  marketCapPercentChange1d?: number;
  priceChange1d?: number;
  pricePercentChange1h?: number;
  pricePercentChange1d?: number;
  pricePercentChange7d?: number;
  pricePercentChange14d?: number;
  pricePercentChange30d?: number;
  pricePercentChange200d?: number;
  pricePercentChange1y?: number;
};

/** Exchange rate info */
export type ExchangeRateInfo = {
  name: string;
  ticker: string;
  value: number;
  currencyType: 'crypto' | 'fiat';
};

/** Exchange rates response */
export type ExchangeRatesResponse = {
  [currency: string]: ExchangeRateInfo;
};

/** Price supported networks response */
export type PriceSupportedNetworksResponse = {
  fullSupport: string[];
  partialSupport: string[];
};

/** V3 Historical prices response */
export type V3HistoricalPricesResponse = {
  prices: [number, number][];
  marketCaps?: [number, number][];
  totalVolumes?: [number, number][];
};

// ============================================================================
// TOKENS API TYPES
// ============================================================================

/** Token supported networks response (v1) */
export type TokenSupportedNetworksResponse = {
  fullSupport: string[];
};

/** Token supported networks response (v2) - includes partial support */
export type TokenV2SupportedNetworksResponse = {
  fullSupport: string[];
  partialSupport: string[];
};

/** Network info */
export type NetworkInfo = {
  active: boolean;
  chainId: number;
  chainName: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
    address: string;
  };
  iconUrl?: string;
  blockExplorerUrl?: string;
  networkType?: string;
  tokenSources?: string[];
};

/** Top asset */
export type TopAsset = {
  address: string;
  symbol: string;
};

/** Token description response */
export type TokenDescriptionResponse = {
  description: string;
};

/** Suggested occurrence floors response */
export type SuggestedOccurrenceFloorsResponse = {
  [chainId: string]: number;
};

/** Asset by CAIP-19 ID response */
export type AssetByIdResponse = {
  assetId: string;
  name: string;
  symbol: string;
  decimals: number;
  address: string;
  chainId: number | string;
  iconUrl?: string;
  iconUrlThumbnail?: string;
  coingeckoId?: string;
  occurrences?: number;
  aggregators?: string[];
};

/** Top gainers sort options */
export type TopGainersSortOption =
  | 'm5_price_change_percentage_desc'
  | 'h1_price_change_percentage_desc'
  | 'h6_price_change_percentage_desc'
  | 'h24_price_change_percentage_desc'
  | 'm5_price_change_percentage_asc'
  | 'h1_price_change_percentage_asc'
  | 'h6_price_change_percentage_asc'
  | 'h24_price_change_percentage_asc';

/** Trending sort options */
export type TrendingSortOption =
  | 'm5_trending'
  | 'h1_trending'
  | 'h6_trending'
  | 'h24_trending';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function calculateRetryDelay(attemptIndex: number): number {
  const delay = Math.min(
    RETRY_CONFIG.BASE_DELAY * 2 ** attemptIndex,
    RETRY_CONFIG.MAX_DELAY,
  );
  return delay / 2 + Math.random() * (delay / 2);
}

function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= RETRY_CONFIG.MAX_RETRIES) {
    return false;
  }

  if (error instanceof Error && 'status' in error) {
    const { status } = error as { status: number };
    // Don't retry 4xx except 429 (rate limit) and 408 (timeout)
    if (status >= 400 && status < 500 && status !== 429 && status !== 408) {
      return false;
    }
  }
  return true;
}

// ============================================================================
// HTTP ERROR
// ============================================================================

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly statusText: string,
    public readonly url: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

// ============================================================================
// QUERY API CLIENT
// ============================================================================

/**
 * MetaMask API Platform Client with TanStack Query caching.
 * Provides cached access to all MetaMask backend APIs.
 */
export class ApiPlatformClient {
  readonly #clientProduct: string;

  readonly #clientVersion: string;

  readonly #getBearerToken?: () => Promise<string | undefined>;

  readonly #queryClient: QueryClient;

  constructor(options: ApiPlatformClientOptions) {
    this.#clientProduct = options.clientProduct;
    this.#clientVersion = options.clientVersion ?? '1.0.0';
    this.#getBearerToken = options.getBearerToken;

    this.#queryClient =
      options.queryClient ??
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: STALE_TIMES.DEFAULT,
            gcTime: GC_TIMES.DEFAULT,
            retry: shouldRetry,
            retryDelay: calculateRetryDelay,
            refetchOnWindowFocus: false,
            networkMode: 'always',
          },
        },
      });
  }

  // ==========================================================================
  // HTTP METHODS
  // ==========================================================================

  async #fetch<T>(
    baseUrl: string,
    path: string,
    options?: {
      signal?: AbortSignal;
      params?: Record<
        string,
        string | string[] | number | number[] | boolean | undefined
      >;
    },
  ): Promise<T> {
    const url = new URL(path, baseUrl);

    if (options?.params) {
      for (const [key, value] of Object.entries(options.params)) {
        if (value === undefined) {
          continue;
        }
        if (Array.isArray(value)) {
          // Convert array values (including number[]) to comma-separated string
          url.searchParams.set(key, value.map(String).join(','));
        } else {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Client-Product': this.#clientProduct,
      'X-Client-Version': this.#clientVersion,
    };

    // Use TanStack Query to cache the bearer token
    // Wrap getBearerToken to return null instead of undefined (TanStack Query doesn't allow undefined)
    if (this.#getBearerToken) {
      const getBearerToken = this.#getBearerToken;
      const token = await this.#queryClient.fetchQuery({
        queryKey: queryKeys.auth.bearerToken(),
        queryFn: async () => (await getBearerToken()) ?? null,
        staleTime: STALE_TIMES.AUTH_TOKEN,
        gcTime: GC_TIMES.DEFAULT,
      });
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers,
      signal: options?.signal,
    });

    if (!response.ok) {
      throw new HttpError(
        `HTTP ${response.status}: ${response.statusText}`,
        response.status,
        response.statusText,
        url.toString(),
      );
    }

    return response.json() as Promise<T>;
  }

  // ==========================================================================
  // ACCOUNTS API - SUPPORTED NETWORKS
  // ==========================================================================

  /**
   * Get list of supported networks (v1 endpoint).
   *
   * @param options
   */
  async fetchV1SupportedNetworks(
    options?: FetchOptions,
  ): Promise<V1SupportedNetworksResponse> {
    return this.#queryClient.fetchQuery({
      queryKey: queryKeys.accounts.v1SupportedNetworks(),
      queryFn: ({ signal }) =>
        this.#fetch<V1SupportedNetworksResponse>(
          API_URLS.ACCOUNTS,
          '/v1/supportedNetworks',
          { signal },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.SUPPORTED_NETWORKS,
      gcTime: options?.gcTime ?? GC_TIMES.EXTENDED,
    });
  }

  /**
   * Get list of supported networks (v2 endpoint).
   *
   * @param options
   */
  async fetchV2SupportedNetworks(
    options?: FetchOptions,
  ): Promise<V2SupportedNetworksResponse> {
    return this.#queryClient.fetchQuery({
      queryKey: queryKeys.accounts.v2SupportedNetworks(),
      queryFn: ({ signal }) =>
        this.#fetch<V2SupportedNetworksResponse>(
          API_URLS.ACCOUNTS,
          '/v2/supportedNetworks',
          { signal },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.SUPPORTED_NETWORKS,
      gcTime: options?.gcTime ?? GC_TIMES.EXTENDED,
    });
  }

  // ==========================================================================
  // ACCOUNTS API - ACTIVE NETWORKS
  // ==========================================================================

  /**
   * Get active networks by CAIP-10 account IDs (v2 endpoint).
   *
   * @param accountIds
   * @param queryOptions
   * @param queryOptions.filterMMListTokens
   * @param queryOptions.networks
   * @param options
   */
  async fetchV2ActiveNetworks(
    accountIds: string[],
    queryOptions?: { filterMMListTokens?: boolean; networks?: string[] },
    options?: FetchOptions,
  ): Promise<ActiveNetworksResponse> {
    return this.#queryClient.fetchQuery({
      queryKey: queryKeys.accounts.v2ActiveNetworks(accountIds, {
        networks: queryOptions?.networks,
      }),
      queryFn: ({ signal }) =>
        this.#fetch<ActiveNetworksResponse>(
          API_URLS.ACCOUNTS,
          '/v2/activeNetworks',
          {
            signal,
            params: {
              accountIds,
              filterMMListTokens: queryOptions?.filterMMListTokens,
              networks: queryOptions?.networks,
            },
          },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.NETWORKS,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }

  // ==========================================================================
  // ACCOUNTS API - BALANCES
  // ==========================================================================

  /**
   * Get account balances for a single address (v2 endpoint).
   *
   * @param address
   * @param queryOptions
   * @param queryOptions.networks
   * @param options
   */
  async fetchV2Balances(
    address: string,
    queryOptions?: { networks?: number[] },
    options?: FetchOptions,
  ): Promise<V2BalancesResponse> {
    return this.#queryClient.fetchQuery({
      queryKey: queryKeys.accounts.balances.v2(address, queryOptions),
      queryFn: ({ signal }) =>
        this.#fetch<V2BalancesResponse>(
          API_URLS.ACCOUNTS,
          `/v2/accounts/${address}/balances`,
          {
            signal,
            params: { networks: queryOptions?.networks },
          },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.BALANCES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }

  /**
   * Get account balances with additional options (v2 endpoint).
   *
   * @param address
   * @param queryOptions
   * @param queryOptions.networks
   * @param queryOptions.filterSupportedTokens
   * @param queryOptions.includeTokenAddresses
   * @param queryOptions.includeStakedAssets
   * @param options
   */
  async fetchV2BalancesWithOptions(
    address: string,
    queryOptions?: {
      networks?: number[];
      filterSupportedTokens?: boolean;
      includeTokenAddresses?: string[];
      includeStakedAssets?: boolean;
    },
    options?: FetchOptions,
  ): Promise<V2BalancesResponse> {
    return this.#queryClient.fetchQuery({
      queryKey: queryKeys.accounts.balances.v2(address, {
        networks: queryOptions?.networks,
      }),
      queryFn: ({ signal }) =>
        this.#fetch<V2BalancesResponse>(
          API_URLS.ACCOUNTS,
          `/v2/accounts/${address}/balances`,
          {
            signal,
            params: {
              networks: queryOptions?.networks,
              filterSupportedTokens: queryOptions?.filterSupportedTokens,
              includeTokenAddresses: queryOptions?.includeTokenAddresses,
              includeStakedAssets: queryOptions?.includeStakedAssets,
            },
          },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.BALANCES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }

  /**
   * Get balances for multiple accounts (v4 endpoint).
   *
   * @param accountAddresses
   * @param queryOptions
   * @param queryOptions.networks
   * @param options
   */
  async fetchV4MultiAccountBalances(
    accountAddresses: string[],
    queryOptions?: { networks?: number[] },
    options?: FetchOptions,
  ): Promise<V4BalancesResponse> {
    return this.#queryClient.fetchQuery({
      queryKey: queryKeys.accounts.balances.v4(accountAddresses, queryOptions),
      queryFn: ({ signal }) =>
        this.#fetch<V4BalancesResponse>(
          API_URLS.ACCOUNTS,
          '/v4/multiaccount/balances',
          {
            signal,
            params: {
              accountAddresses,
              networks: queryOptions?.networks,
            },
          },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.BALANCES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }

  /**
   * Get balances for multiple accounts using CAIP-10 IDs (v5 endpoint).
   *
   * @param accountIds
   * @param queryOptions
   * @param queryOptions.filterMMListTokens
   * @param queryOptions.networks
   * @param queryOptions.includeStakedAssets
   * @param options
   */
  async fetchV5MultiAccountBalances(
    accountIds: string[],
    queryOptions?: {
      filterMMListTokens?: boolean;
      networks?: string[];
      includeStakedAssets?: boolean;
    },
    options?: FetchOptions,
  ): Promise<V5BalancesResponse> {
    return this.#queryClient.fetchQuery({
      queryKey: queryKeys.accounts.balances.v5(accountIds, {
        networks: queryOptions?.networks,
      }),
      queryFn: ({ signal }) =>
        this.#fetch<V5BalancesResponse>(
          API_URLS.ACCOUNTS,
          '/v5/multiaccount/balances',
          {
            signal,
            params: {
              accountIds,
              networks: queryOptions?.networks,
              filterMMListTokens: queryOptions?.filterMMListTokens,
              includeStakedAssets: queryOptions?.includeStakedAssets,
            },
          },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.BALANCES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }

  // ==========================================================================
  // ACCOUNTS API - TRANSACTIONS
  // ==========================================================================

  /**
   * Get a specific transaction by hash (v1 endpoint).
   *
   * @param chainId
   * @param txHash
   * @param queryOptions
   * @param queryOptions.includeLogs
   * @param queryOptions.includeValueTransfers
   * @param queryOptions.includeTxMetadata
   * @param queryOptions.lang
   * @param options
   */
  async fetchV1TransactionByHash(
    chainId: number,
    txHash: string,
    queryOptions?: {
      includeLogs?: boolean;
      includeValueTransfers?: boolean;
      includeTxMetadata?: boolean;
      lang?: string;
    },
    options?: FetchOptions,
  ): Promise<TransactionByHashResponse> {
    return this.#queryClient.fetchQuery({
      queryKey: queryKeys.accounts.transactions.v1ByHash(chainId, txHash),
      queryFn: ({ signal }) =>
        this.#fetch<TransactionByHashResponse>(
          API_URLS.ACCOUNTS,
          `/v1/networks/${chainId}/transactions/${txHash}`,
          {
            signal,
            params: {
              includeLogs: queryOptions?.includeLogs,
              includeValueTransfers: queryOptions?.includeValueTransfers,
              includeTxMetadata: queryOptions?.includeTxMetadata,
              lang: queryOptions?.lang,
            },
          },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.TRANSACTIONS,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }

  /**
   * Get account transactions (v1 endpoint).
   *
   * @param address
   * @param queryOptions
   * @param queryOptions.chainIds
   * @param queryOptions.cursor
   * @param queryOptions.startTimestamp
   * @param queryOptions.endTimestamp
   * @param queryOptions.sortDirection
   * @param options
   */
  async fetchV1AccountTransactions(
    address: string,
    queryOptions?: {
      chainIds?: string[];
      cursor?: string;
      startTimestamp?: number;
      endTimestamp?: number;
      sortDirection?: 'ASC' | 'DESC';
    },
    options?: FetchOptions,
  ): Promise<AccountTransactionsResponse> {
    return this.#queryClient.fetchQuery({
      queryKey: queryKeys.accounts.transactions.v1Account(address, {
        chainIds: queryOptions?.chainIds,
        cursor: queryOptions?.cursor,
      }),
      queryFn: ({ signal }) =>
        this.#fetch<AccountTransactionsResponse>(
          API_URLS.ACCOUNTS,
          `/v1/accounts/${address}/transactions`,
          {
            signal,
            params: {
              networks: queryOptions?.chainIds,
              cursor: queryOptions?.cursor,
              startTimestamp: queryOptions?.startTimestamp,
              endTimestamp: queryOptions?.endTimestamp,
              sortDirection: queryOptions?.sortDirection,
            },
          },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.TRANSACTIONS,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }

  /**
   * Get multi-account transactions (v4 endpoint).
   *
   * @param accountIds
   * @param queryOptions
   * @param queryOptions.networks
   * @param queryOptions.cursor
   * @param queryOptions.sortDirection
   * @param queryOptions.includeLogs
   * @param queryOptions.includeValueTransfers
   * @param queryOptions.includeTxMetadata
   * @param options
   */
  async fetchV4MultiAccountTransactions(
    accountIds: string[],
    queryOptions?: {
      networks?: string[];
      cursor?: string;
      sortDirection?: 'ASC' | 'DESC';
      includeLogs?: boolean;
      includeValueTransfers?: boolean;
      includeTxMetadata?: boolean;
    },
    options?: FetchOptions,
  ): Promise<V4MultiAccountTransactionsResponse> {
    return this.#queryClient.fetchQuery({
      queryKey: queryKeys.accounts.transactions.v4MultiAccount(accountIds, {
        networks: queryOptions?.networks,
        cursor: queryOptions?.cursor,
      }),
      queryFn: ({ signal }) =>
        this.#fetch<V4MultiAccountTransactionsResponse>(
          API_URLS.ACCOUNTS,
          '/v4/multiaccount/transactions',
          {
            signal,
            params: {
              accountIds,
              networks: queryOptions?.networks,
              cursor: queryOptions?.cursor,
              sortDirection: queryOptions?.sortDirection,
              includeLogs: queryOptions?.includeLogs,
              includeValueTransfers: queryOptions?.includeValueTransfers,
              includeTxMetadata: queryOptions?.includeTxMetadata,
            },
          },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.TRANSACTIONS,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }

  // ==========================================================================
  // ACCOUNTS API - RELATIONSHIPS
  // ==========================================================================

  /**
   * Get account address relationship (v1 endpoint).
   *
   * @param chainId
   * @param from
   * @param to
   * @param options
   */
  async fetchV1AccountRelationship(
    chainId: number,
    from: string,
    to: string,
    options?: FetchOptions,
  ): Promise<AccountRelationshipResult> {
    return this.#queryClient.fetchQuery({
      queryKey: queryKeys.accounts.v1Relationship(chainId, from, to),
      queryFn: async ({ signal }) => {
        try {
          return await this.#fetch<AccountRelationshipResult>(
            API_URLS.ACCOUNTS,
            `/v1/networks/${chainId}/accounts/${from}/relationships/${to}`,
            { signal },
          );
        } catch (error) {
          if (
            error instanceof Error &&
            'body' in error &&
            typeof (error as { body?: unknown }).body === 'object'
          ) {
            const { body } = error as {
              body?: { error?: { code: string; message: string } };
            };
            if (body?.error) {
              return {
                error: {
                  code: body.error.code,
                  message: body.error.message,
                },
              };
            }
          }
          throw error;
        }
      },
      staleTime: options?.staleTime ?? STALE_TIMES.DEFAULT,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }

  // ==========================================================================
  // ACCOUNTS API - NFTs
  // ==========================================================================

  /**
   * Get NFTs owned by an account (v2 endpoint).
   *
   * @param address
   * @param queryOptions
   * @param queryOptions.networks
   * @param queryOptions.cursor
   * @param options
   */
  async fetchV2AccountNfts(
    address: string,
    queryOptions?: { networks?: number[]; cursor?: string },
    options?: FetchOptions,
  ): Promise<NftsResponse> {
    return this.#queryClient.fetchQuery({
      queryKey: queryKeys.accounts.v2Nfts(address, queryOptions),
      queryFn: ({ signal }) =>
        this.#fetch<NftsResponse>(
          API_URLS.ACCOUNTS,
          `/v2/accounts/${address}/nfts`,
          {
            signal,
            params: {
              networks: queryOptions?.networks,
              cursor: queryOptions?.cursor,
            },
          },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.DEFAULT,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }

  // ==========================================================================
  // ACCOUNTS API - TOKEN DISCOVERY
  // ==========================================================================

  /**
   * Get ERC20 tokens detected for an account (v2 endpoint).
   *
   * @param address
   * @param queryOptions
   * @param queryOptions.networks
   * @param options
   */
  async fetchV2AccountTokens(
    address: string,
    queryOptions?: { networks?: number[] },
    options?: FetchOptions,
  ): Promise<TokensResponse> {
    return this.#queryClient.fetchQuery({
      queryKey: queryKeys.accounts.v2Tokens(address, queryOptions),
      queryFn: ({ signal }) =>
        this.#fetch<TokensResponse>(
          API_URLS.ACCOUNTS,
          `/v2/accounts/${address}/tokens`,
          {
            signal,
            params: { networks: queryOptions?.networks },
          },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.DEFAULT,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }

  // ==========================================================================
  // PRICES API - SUPPORTED NETWORKS
  // ==========================================================================

  /**
   * Get price supported networks (v1 endpoint).
   *
   * @param options
   */
  async fetchPriceV1SupportedNetworks(
    options?: FetchOptions,
  ): Promise<PriceSupportedNetworksResponse> {
    return this.#queryClient.fetchQuery({
      queryKey: queryKeys.prices.v1SupportedNetworks(),
      queryFn: ({ signal }) =>
        this.#fetch<PriceSupportedNetworksResponse>(
          API_URLS.PRICES,
          '/v1/supportedNetworks',
          { signal },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.SUPPORTED_NETWORKS,
      gcTime: options?.gcTime ?? GC_TIMES.EXTENDED,
    });
  }

  /**
   * Get price supported networks in CAIP format (v2 endpoint).
   *
   * @param options
   */
  async fetchPriceV2SupportedNetworks(
    options?: FetchOptions,
  ): Promise<PriceSupportedNetworksResponse> {
    return this.#queryClient.fetchQuery({
      queryKey: queryKeys.prices.v2SupportedNetworks(),
      queryFn: ({ signal }) =>
        this.#fetch<PriceSupportedNetworksResponse>(
          API_URLS.PRICES,
          '/v2/supportedNetworks',
          { signal },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.SUPPORTED_NETWORKS,
      gcTime: options?.gcTime ?? GC_TIMES.EXTENDED,
    });
  }

  // ==========================================================================
  // PRICES API - EXCHANGE RATES
  // ==========================================================================

  /**
   * Get all exchange rates for a base currency (v1 endpoint).
   *
   * @param baseCurrency
   * @param options
   */
  async fetchV1ExchangeRates(
    baseCurrency: string,
    options?: FetchOptions,
  ): Promise<ExchangeRatesResponse> {
    return this.#queryClient.fetchQuery({
      queryKey: queryKeys.prices.v1ExchangeRates(baseCurrency),
      queryFn: ({ signal }) =>
        this.#fetch<ExchangeRatesResponse>(
          API_URLS.PRICES,
          '/v1/exchange-rates',
          {
            signal,
            params: { baseCurrency },
          },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.EXCHANGE_RATES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }

  /**
   * Get fiat exchange rates (v1 endpoint).
   *
   * @param options
   */
  async fetchV1FiatExchangeRates(
    options?: FetchOptions,
  ): Promise<ExchangeRatesResponse> {
    return this.#queryClient.fetchQuery({
      queryKey: queryKeys.prices.v1FiatExchangeRates(),
      queryFn: ({ signal }) =>
        this.#fetch<ExchangeRatesResponse>(
          API_URLS.PRICES,
          '/v1/exchange-rates/fiat',
          { signal },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.EXCHANGE_RATES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }

  /**
   * Get crypto exchange rates (v1 endpoint).
   *
   * @param options
   */
  async fetchV1CryptoExchangeRates(
    options?: FetchOptions,
  ): Promise<ExchangeRatesResponse> {
    return this.#queryClient.fetchQuery({
      queryKey: queryKeys.prices.v1CryptoExchangeRates(),
      queryFn: ({ signal }) =>
        this.#fetch<ExchangeRatesResponse>(
          API_URLS.PRICES,
          '/v1/exchange-rates/crypto',
          { signal },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.EXCHANGE_RATES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }

  // ==========================================================================
  // PRICES API - V1 SPOT PRICES (CoinGecko ID based)
  // ==========================================================================

  /**
   * Get spot prices by CoinGecko coin IDs (v1 endpoint).
   *
   * @param coinIds
   * @param options
   */
  async fetchV1SpotPricesByCoinIds(
    coinIds: string[],
    options?: FetchOptions,
  ): Promise<Record<string, CoinGeckoSpotPrice>> {
    if (coinIds.length === 0) {
      return {};
    }
    return this.#queryClient.fetchQuery({
      queryKey: queryKeys.prices.v1SpotPricesByCoinIds(coinIds),
      queryFn: ({ signal }) =>
        this.#fetch<Record<string, CoinGeckoSpotPrice>>(
          API_URLS.PRICES,
          '/v1/spot-prices',
          {
            signal,
            params: { coinIds },
          },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.PRICES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }

  /**
   * Get spot price for a single CoinGecko coin ID (v1 endpoint).
   *
   * @param coinId
   * @param currency
   * @param options
   */
  async fetchV1SpotPriceByCoinId(
    coinId: string,
    currency: SupportedCurrency = 'usd',
    options?: FetchOptions,
  ): Promise<CoinGeckoSpotPrice> {
    return this.#queryClient.fetchQuery({
      queryKey: queryKeys.prices.v1SpotPriceByCoinId(coinId, currency),
      queryFn: ({ signal }) =>
        this.#fetch<CoinGeckoSpotPrice>(
          API_URLS.PRICES,
          `/v1/spot-prices/${coinId}`,
          {
            signal,
            params: { vsCurrency: currency },
          },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.PRICES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }

  // ==========================================================================
  // PRICES API - V1 SPOT PRICES (Token Address based)
  // ==========================================================================

  /**
   * Get spot prices for tokens on a chain (v1 endpoint).
   *
   * @param chainId
   * @param tokenAddresses
   * @param queryOptions
   * @param queryOptions.currency
   * @param queryOptions.includeMarketData
   * @param options
   */
  async fetchV1TokenPrices(
    chainId: string,
    tokenAddresses: string[],
    queryOptions?: {
      currency?: SupportedCurrency;
      includeMarketData?: boolean;
    },
    options?: FetchOptions,
  ): Promise<Record<string, Record<string, number>>> {
    if (tokenAddresses.length === 0) {
      return {};
    }
    const chainIdDecimal = parseInt(chainId, 16);
    return this.#queryClient.fetchQuery({
      queryKey: queryKeys.prices.v1TokenPrices(
        chainId,
        tokenAddresses,
        queryOptions?.currency,
      ),
      queryFn: ({ signal }) =>
        this.#fetch<Record<string, Record<string, number>>>(
          API_URLS.PRICES,
          `/v1/chains/${chainIdDecimal}/spot-prices`,
          {
            signal,
            params: {
              tokenAddresses,
              vsCurrency: queryOptions?.currency ?? 'usd',
              includeMarketData: queryOptions?.includeMarketData,
            },
          },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.PRICES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }

  /**
   * Get spot price for a single token (v1 endpoint).
   *
   * @param chainId
   * @param tokenAddress
   * @param currency
   * @param options
   */
  async fetchV1TokenPrice(
    chainId: string,
    tokenAddress: string,
    currency: SupportedCurrency = 'usd',
    options?: FetchOptions,
  ): Promise<MarketDataDetails | undefined> {
    const chainIdDecimal = parseInt(chainId, 16);
    try {
      return await this.#queryClient.fetchQuery({
        queryKey: queryKeys.prices.v1TokenPrice(
          chainId,
          tokenAddress,
          currency,
        ),
        queryFn: ({ signal }) =>
          this.#fetch<MarketDataDetails>(
            API_URLS.PRICES,
            `/v1/chains/${chainIdDecimal}/spot-prices/${tokenAddress}`,
            {
              signal,
              params: { vsCurrency: currency },
            },
          ),
        staleTime: options?.staleTime ?? STALE_TIMES.PRICES,
        gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
      });
    } catch {
      return undefined;
    }
  }

  // ==========================================================================
  // PRICES API - V2 SPOT PRICES
  // ==========================================================================

  /**
   * Get spot prices for tokens on a chain with market data (v2 endpoint).
   *
   * @param chainId
   * @param tokenAddresses
   * @param queryOptions
   * @param queryOptions.currency
   * @param queryOptions.includeMarketData
   * @param options
   */
  async fetchV2SpotPrices(
    chainId: string,
    tokenAddresses: string[],
    queryOptions?: {
      currency?: SupportedCurrency;
      includeMarketData?: boolean;
    },
    options?: FetchOptions,
  ): Promise<Record<string, MarketDataDetails>> {
    if (tokenAddresses.length === 0) {
      return {};
    }
    const chainIdDecimal = parseInt(chainId, 16);
    return this.#queryClient.fetchQuery({
      queryKey: queryKeys.prices.v2SpotPrices(
        chainId,
        tokenAddresses,
        queryOptions?.currency,
      ),
      queryFn: ({ signal }) =>
        this.#fetch<Record<string, MarketDataDetails>>(
          API_URLS.PRICES,
          `/v2/chains/${chainIdDecimal}/spot-prices`,
          {
            signal,
            params: {
              tokenAddresses,
              vsCurrency: queryOptions?.currency ?? 'usd',
              includeMarketData: queryOptions?.includeMarketData ?? true,
            },
          },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.PRICES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }

  // ==========================================================================
  // PRICES API - V3 SPOT PRICES (CAIP-19 based)
  // ==========================================================================

  /**
   * Get spot prices by CAIP-19 asset IDs (v3 endpoint).
   *
   * @param assetIds
   * @param queryOptions
   * @param queryOptions.currency
   * @param queryOptions.includeMarketData
   * @param queryOptions.cacheOnly
   * @param options
   */
  async fetchV3SpotPrices(
    assetIds: string[],
    queryOptions?: {
      currency?: SupportedCurrency;
      includeMarketData?: boolean;
      cacheOnly?: boolean;
    },
    options?: FetchOptions,
  ): Promise<V3SpotPricesResponse> {
    if (assetIds.length === 0) {
      return {};
    }
    return this.#queryClient.fetchQuery({
      queryKey: queryKeys.prices.v3SpotPrices(
        assetIds,
        queryOptions?.currency,
        queryOptions?.includeMarketData,
      ),
      queryFn: ({ signal }) =>
        this.#fetch<V3SpotPricesResponse>(API_URLS.PRICES, '/v3/spot-prices', {
          signal,
          params: {
            assetIds,
            vsCurrency: (queryOptions?.currency ?? 'usd').toUpperCase(),
            includeMarketData: queryOptions?.includeMarketData ?? true,
            cacheOnly: queryOptions?.cacheOnly ?? false,
          },
        }),
      staleTime: options?.staleTime ?? STALE_TIMES.PRICES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }

  // ==========================================================================
  // PRICES API - V1 HISTORICAL PRICES
  // ==========================================================================

  /**
   * Get historical prices by CoinGecko coin ID (v1 endpoint).
   *
   * @param coinId
   * @param queryOptions
   * @param queryOptions.currency
   * @param queryOptions.timePeriod
   * @param queryOptions.from
   * @param queryOptions.to
   * @param options
   */
  async fetchV1HistoricalPricesByCoinId(
    coinId: string,
    queryOptions?: {
      currency?: SupportedCurrency;
      timePeriod?: string;
      from?: number;
      to?: number;
    },
    options?: FetchOptions,
  ): Promise<GetHistoricalPricesResponse> {
    return this.#queryClient.fetchQuery({
      queryKey: queryKeys.prices.v1HistoricalByCoinId(coinId, {
        currency: queryOptions?.currency,
        timePeriod: queryOptions?.timePeriod,
      }),
      queryFn: ({ signal }) =>
        this.#fetch<GetHistoricalPricesResponse>(
          API_URLS.PRICES,
          `/v1/historical-prices/${coinId}`,
          {
            signal,
            params: {
              vsCurrency: queryOptions?.currency,
              timePeriod: queryOptions?.timePeriod,
              from: queryOptions?.from,
              to: queryOptions?.to,
            },
          },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.PRICES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }

  /**
   * Get historical prices for tokens on a chain (v1 endpoint).
   *
   * @param chainId
   * @param tokenAddresses
   * @param queryOptions
   * @param queryOptions.currency
   * @param queryOptions.timePeriod
   * @param queryOptions.from
   * @param queryOptions.to
   * @param options
   */
  async fetchV1HistoricalPricesByTokenAddresses(
    chainId: string,
    tokenAddresses: string[],
    queryOptions?: {
      currency?: SupportedCurrency;
      timePeriod?: string;
      from?: number;
      to?: number;
    },
    options?: FetchOptions,
  ): Promise<GetHistoricalPricesResponse> {
    const chainIdDecimal = parseInt(chainId, 16);
    return this.#queryClient.fetchQuery({
      queryKey: queryKeys.prices.v1HistoricalByTokenAddresses(
        chainId,
        tokenAddresses,
        {
          currency: queryOptions?.currency,
          timePeriod: queryOptions?.timePeriod,
        },
      ),
      queryFn: ({ signal }) =>
        this.#fetch<GetHistoricalPricesResponse>(
          API_URLS.PRICES,
          `/v1/chains/${chainIdDecimal}/historical-prices`,
          {
            signal,
            params: {
              tokenAddresses,
              vsCurrency: queryOptions?.currency,
              timePeriod: queryOptions?.timePeriod,
              from: queryOptions?.from,
              to: queryOptions?.to,
            },
          },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.PRICES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }

  /**
   * Get historical prices for a single token (v1 endpoint).
   *
   * @param chainId
   * @param tokenAddress
   * @param queryOptions
   * @param queryOptions.currency
   * @param queryOptions.timeRange
   * @param options
   */
  async fetchV1HistoricalPrices(
    chainId: string,
    tokenAddress: string,
    queryOptions?: { currency?: SupportedCurrency; timeRange?: string },
    options?: FetchOptions,
  ): Promise<GetHistoricalPricesResponse> {
    const chainIdDecimal = parseInt(chainId, 16);
    const currency = queryOptions?.currency ?? 'usd';
    const timeRange = queryOptions?.timeRange ?? '7d';
    return this.#queryClient.fetchQuery({
      queryKey: queryKeys.prices.v1Historical(
        chainId,
        tokenAddress,
        currency,
        timeRange,
      ),
      queryFn: ({ signal }) =>
        this.#fetch<GetHistoricalPricesResponse>(
          API_URLS.PRICES,
          `/v1/chains/${chainIdDecimal}/historical-prices/${tokenAddress}`,
          {
            signal,
            params: {
              vsCurrency: currency,
              timePeriod: timeRange,
            },
          },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.PRICES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }

  // ==========================================================================
  // PRICES API - V3 HISTORICAL PRICES
  // ==========================================================================

  /**
   * Get historical prices by CAIP-19 asset ID (v3 endpoint).
   *
   * @param chainId
   * @param assetType
   * @param queryOptions
   * @param queryOptions.currency
   * @param queryOptions.timePeriod
   * @param queryOptions.from
   * @param queryOptions.to
   * @param queryOptions.interval
   * @param options
   */
  async fetchV3HistoricalPrices(
    chainId: string,
    assetType: string,
    queryOptions?: {
      currency?: SupportedCurrency;
      timePeriod?: string;
      from?: number;
      to?: number;
      interval?: '5m' | 'hourly' | 'daily';
    },
    options?: FetchOptions,
  ): Promise<V3HistoricalPricesResponse> {
    return this.#queryClient.fetchQuery({
      queryKey: queryKeys.prices.v3Historical(chainId, assetType, {
        currency: queryOptions?.currency,
        timePeriod: queryOptions?.timePeriod,
      }),
      queryFn: ({ signal }) =>
        this.#fetch<V3HistoricalPricesResponse>(
          API_URLS.PRICES,
          `/v3/historical-prices/${chainId}/${assetType}`,
          {
            signal,
            params: {
              vsCurrency: queryOptions?.currency,
              timePeriod: queryOptions?.timePeriod,
              from: queryOptions?.from,
              to: queryOptions?.to,
              interval: queryOptions?.interval,
            },
          },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.PRICES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }

  // ==========================================================================
  // PRICES API - V1 HISTORICAL PRICE GRAPH
  // ==========================================================================

  /**
   * Get historical price graph data by CoinGecko coin ID (v1 endpoint).
   *
   * @param coinId
   * @param queryOptions
   * @param queryOptions.currency
   * @param queryOptions.includeOHLC
   * @param options
   */
  async fetchV1HistoricalPriceGraphByCoinId(
    coinId: string,
    queryOptions?: { currency?: SupportedCurrency; includeOHLC?: boolean },
    options?: FetchOptions,
  ): Promise<V3HistoricalPricesResponse> {
    const currency = queryOptions?.currency ?? 'usd';
    const includeOHLC = queryOptions?.includeOHLC ?? false;
    return this.#queryClient.fetchQuery({
      queryKey: queryKeys.prices.v1GraphByCoinId(coinId, currency, includeOHLC),
      queryFn: ({ signal }) =>
        this.#fetch<V3HistoricalPricesResponse>(
          API_URLS.PRICES,
          `/v1/historical-prices-graph/${coinId}`,
          {
            signal,
            params: {
              vsCurrency: currency,
              includeOHLC,
            },
          },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.PRICES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }

  /**
   * Get historical price graph data by token address (v1 endpoint).
   *
   * @param chainId
   * @param tokenAddress
   * @param queryOptions
   * @param queryOptions.currency
   * @param queryOptions.includeOHLC
   * @param options
   */
  async fetchV1HistoricalPriceGraphByTokenAddress(
    chainId: string,
    tokenAddress: string,
    queryOptions?: { currency?: SupportedCurrency; includeOHLC?: boolean },
    options?: FetchOptions,
  ): Promise<V3HistoricalPricesResponse> {
    const chainIdDecimal = parseInt(chainId, 16);
    const currency = queryOptions?.currency ?? 'usd';
    const includeOHLC = queryOptions?.includeOHLC ?? false;
    return this.#queryClient.fetchQuery({
      queryKey: queryKeys.prices.v1GraphByTokenAddress(
        chainId,
        tokenAddress,
        currency,
        includeOHLC,
      ),
      queryFn: ({ signal }) =>
        this.#fetch<V3HistoricalPricesResponse>(
          API_URLS.PRICES,
          `/v1/chains/${chainIdDecimal}/historical-prices-graph/${tokenAddress}`,
          {
            signal,
            params: {
              vsCurrency: currency,
              includeOHLC,
            },
          },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.PRICES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }

  // ==========================================================================
  // TOKENS API - SUPPORTED NETWORKS
  // ==========================================================================

  /**
   * Get token supported networks (v1 endpoint).
   *
   * @param options
   */
  async fetchTokenV1SupportedNetworks(
    options?: FetchOptions,
  ): Promise<TokenSupportedNetworksResponse> {
    return this.#queryClient.fetchQuery({
      queryKey: queryKeys.tokens.v1SupportedNetworks(),
      queryFn: ({ signal }) =>
        this.#fetch<TokenSupportedNetworksResponse>(
          API_URLS.TOKENS,
          '/v1/supportedNetworks',
          { signal },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.SUPPORTED_NETWORKS,
      gcTime: options?.gcTime ?? GC_TIMES.EXTENDED,
    });
  }

  /**
   * Get token supported networks (v2 endpoint).
   * Returns both fullSupport and partialSupport networks.
   *
   * @param options
   */
  async fetchTokenV2SupportedNetworks(
    options?: FetchOptions,
  ): Promise<TokenV2SupportedNetworksResponse> {
    return this.#queryClient.fetchQuery({
      queryKey: queryKeys.tokens.v2SupportedNetworks(),
      queryFn: ({ signal }) =>
        this.#fetch<TokenV2SupportedNetworksResponse>(
          API_URLS.TOKENS,
          '/v2/supportedNetworks',
          { signal },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.SUPPORTED_NETWORKS,
      gcTime: options?.gcTime ?? GC_TIMES.EXTENDED,
    });
  }

  // ==========================================================================
  // TOKENS API - NETWORKS
  // ==========================================================================

  /**
   * Get all networks.
   *
   * @param options
   */
  async fetchNetworks(options?: FetchOptions): Promise<NetworkInfo[]> {
    return this.#queryClient.fetchQuery({
      queryKey: queryKeys.tokens.networks(),
      queryFn: ({ signal }) =>
        this.#fetch<NetworkInfo[]>(API_URLS.TOKEN, '/networks', { signal }),
      staleTime: options?.staleTime ?? STALE_TIMES.SUPPORTED_NETWORKS,
      gcTime: options?.gcTime ?? GC_TIMES.EXTENDED,
    });
  }

  /**
   * Get network by chain ID.
   *
   * @param chainId
   * @param options
   */
  async fetchNetworkByChainId(
    chainId: number,
    options?: FetchOptions,
  ): Promise<NetworkInfo> {
    return this.#queryClient.fetchQuery({
      queryKey: queryKeys.tokens.networkByChainId(chainId),
      queryFn: ({ signal }) =>
        this.#fetch<NetworkInfo>(API_URLS.TOKEN, `/networks/${chainId}`, {
          signal,
        }),
      staleTime: options?.staleTime ?? STALE_TIMES.SUPPORTED_NETWORKS,
      gcTime: options?.gcTime ?? GC_TIMES.EXTENDED,
    });
  }

  // ==========================================================================
  // TOKENS API - TOKEN LIST
  // ==========================================================================

  /**
   * Get token list for a chain.
   *
   * @param chainId
   * @param queryOptions
   * @param queryOptions.includeTokenFees
   * @param queryOptions.includeAssetType
   * @param queryOptions.includeAggregators
   * @param queryOptions.includeERC20Permit
   * @param queryOptions.includeOccurrences
   * @param queryOptions.includeStorage
   * @param queryOptions.includeIconUrl
   * @param queryOptions.includeAddress
   * @param queryOptions.includeName
   * @param options
   */
  async fetchTokenList(
    chainId: number,
    queryOptions?: {
      includeTokenFees?: boolean;
      includeAssetType?: boolean;
      includeAggregators?: boolean;
      includeERC20Permit?: boolean;
      includeOccurrences?: boolean;
      includeStorage?: boolean;
      includeIconUrl?: boolean;
      includeAddress?: boolean;
      includeName?: boolean;
    },
    options?: FetchOptions,
  ): Promise<TokenMetadata[]> {
    return this.#queryClient.fetchQuery({
      queryKey: queryKeys.tokens.tokenList(chainId),
      queryFn: ({ signal }) =>
        this.#fetch<TokenMetadata[]>(API_URLS.TOKEN, `/tokens/${chainId}`, {
          signal,
          params: {
            includeTokenFees: queryOptions?.includeTokenFees,
            includeAssetType: queryOptions?.includeAssetType,
            includeAggregators: queryOptions?.includeAggregators,
            includeERC20Permit: queryOptions?.includeERC20Permit,
            includeOccurrences: queryOptions?.includeOccurrences,
            includeStorage: queryOptions?.includeStorage,
            includeIconUrl: queryOptions?.includeIconUrl,
            includeAddress: queryOptions?.includeAddress,
            includeName: queryOptions?.includeName,
          },
        }),
      staleTime: options?.staleTime ?? STALE_TIMES.TOKEN_LIST,
      gcTime: options?.gcTime ?? GC_TIMES.EXTENDED,
    });
  }

  // ==========================================================================
  // TOKENS API - TOKEN METADATA
  // ==========================================================================

  /**
   * Get token metadata by address.
   *
   * @param chainId
   * @param tokenAddress
   * @param queryOptions
   * @param queryOptions.includeTokenFees
   * @param queryOptions.includeAssetType
   * @param queryOptions.includeAggregators
   * @param queryOptions.includeERC20Permit
   * @param queryOptions.includeOccurrences
   * @param queryOptions.includeStorage
   * @param queryOptions.includeIconUrl
   * @param queryOptions.includeAddress
   * @param queryOptions.includeName
   * @param options
   */
  async fetchV1TokenMetadata(
    chainId: number,
    tokenAddress: string,
    queryOptions?: {
      includeTokenFees?: boolean;
      includeAssetType?: boolean;
      includeAggregators?: boolean;
      includeERC20Permit?: boolean;
      includeOccurrences?: boolean;
      includeStorage?: boolean;
      includeIconUrl?: boolean;
      includeAddress?: boolean;
      includeName?: boolean;
    },
    options?: FetchOptions,
  ): Promise<TokenMetadata | undefined> {
    try {
      return await this.#queryClient.fetchQuery({
        queryKey: queryKeys.tokens.v1Metadata(chainId, tokenAddress),
        queryFn: ({ signal }) =>
          this.#fetch<TokenMetadata>(API_URLS.TOKEN, `/token/${chainId}`, {
            signal,
            params: {
              address: tokenAddress,
              includeTokenFees: queryOptions?.includeTokenFees,
              includeAssetType: queryOptions?.includeAssetType,
              includeAggregators: queryOptions?.includeAggregators,
              includeERC20Permit: queryOptions?.includeERC20Permit,
              includeOccurrences: queryOptions?.includeOccurrences,
              includeStorage: queryOptions?.includeStorage,
              includeIconUrl: queryOptions?.includeIconUrl,
              includeAddress: queryOptions?.includeAddress,
              includeName: queryOptions?.includeName,
            },
          }),
        staleTime: options?.staleTime ?? STALE_TIMES.TOKEN_METADATA,
        gcTime: options?.gcTime ?? GC_TIMES.EXTENDED,
      });
    } catch {
      return undefined;
    }
  }

  /**
   * Get token description.
   *
   * @param chainId
   * @param tokenAddress
   * @param options
   */
  async fetchTokenDescription(
    chainId: number,
    tokenAddress: string,
    options?: FetchOptions,
  ): Promise<TokenDescriptionResponse | undefined> {
    try {
      return await this.#queryClient.fetchQuery({
        queryKey: queryKeys.tokens.tokenDescription(chainId, tokenAddress),
        queryFn: ({ signal }) =>
          this.#fetch<TokenDescriptionResponse>(
            API_URLS.TOKEN,
            `/token/${chainId}/description`,
            {
              signal,
              params: { address: tokenAddress },
            },
          ),
        staleTime: options?.staleTime ?? STALE_TIMES.TOKEN_METADATA,
        gcTime: options?.gcTime ?? GC_TIMES.EXTENDED,
      });
    } catch {
      return undefined;
    }
  }

  // ==========================================================================
  // TOKENS API - TRENDING & TOP TOKENS
  // ==========================================================================

  /**
   * Get trending tokens (v3 endpoint).
   *
   * @param chainIds
   * @param queryOptions
   * @param queryOptions.sortBy
   * @param queryOptions.minLiquidity
   * @param queryOptions.minVolume24hUsd
   * @param queryOptions.maxVolume24hUsd
   * @param queryOptions.minMarketCap
   * @param queryOptions.maxMarketCap
   * @param options
   */
  async fetchV3TrendingTokens(
    chainIds: string[],
    queryOptions?: {
      sortBy?: TrendingSortOption;
      minLiquidity?: number;
      minVolume24hUsd?: number;
      maxVolume24hUsd?: number;
      minMarketCap?: number;
      maxMarketCap?: number;
    },
    options?: FetchOptions,
  ): Promise<TrendingToken[]> {
    return this.#queryClient.fetchQuery({
      queryKey: queryKeys.tokens.v3Trending(chainIds, queryOptions?.sortBy),
      queryFn: ({ signal }) =>
        this.#fetch<TrendingToken[]>(API_URLS.TOKEN, '/v3/tokens/trending', {
          signal,
          params: {
            chainIds,
            sort: queryOptions?.sortBy,
            minLiquidity: queryOptions?.minLiquidity,
            minVolume24hUsd: queryOptions?.minVolume24hUsd,
            maxVolume24hUsd: queryOptions?.maxVolume24hUsd,
            minMarketCap: queryOptions?.minMarketCap,
            maxMarketCap: queryOptions?.maxMarketCap,
          },
        }),
      staleTime: options?.staleTime ?? STALE_TIMES.TRENDING,
      gcTime: options?.gcTime ?? GC_TIMES.SHORT,
    });
  }

  /**
   * Get top gainers/losers (v3 endpoint).
   *
   * @param chainIds
   * @param queryOptions
   * @param queryOptions.sort
   * @param queryOptions.blockRegion
   * @param queryOptions.minLiquidity
   * @param queryOptions.minVolume24hUsd
   * @param queryOptions.maxVolume24hUsd
   * @param queryOptions.minMarketCap
   * @param queryOptions.maxMarketCap
   * @param options
   */
  async fetchV3TopGainers(
    chainIds: string[],
    queryOptions?: {
      sort?: TopGainersSortOption;
      blockRegion?: 'global' | 'us';
      minLiquidity?: number;
      minVolume24hUsd?: number;
      maxVolume24hUsd?: number;
      minMarketCap?: number;
      maxMarketCap?: number;
    },
    options?: FetchOptions,
  ): Promise<TrendingToken[]> {
    return this.#queryClient.fetchQuery({
      queryKey: queryKeys.tokens.v3TopGainers(chainIds, queryOptions?.sort),
      queryFn: ({ signal }) =>
        this.#fetch<TrendingToken[]>(API_URLS.TOKEN, '/v3/tokens/top-gainers', {
          signal,
          params: {
            chainIds,
            sort: queryOptions?.sort,
            blockRegion: queryOptions?.blockRegion,
            minLiquidity: queryOptions?.minLiquidity,
            minVolume24hUsd: queryOptions?.minVolume24hUsd,
            maxVolume24hUsd: queryOptions?.maxVolume24hUsd,
            minMarketCap: queryOptions?.minMarketCap,
            maxMarketCap: queryOptions?.maxMarketCap,
          },
        }),
      staleTime: options?.staleTime ?? STALE_TIMES.TRENDING,
      gcTime: options?.gcTime ?? GC_TIMES.SHORT,
    });
  }

  /**
   * Get popular tokens (v3 endpoint).
   *
   * @param chainIds
   * @param queryOptions
   * @param queryOptions.blockRegion
   * @param queryOptions.minLiquidity
   * @param queryOptions.minVolume24hUsd
   * @param queryOptions.maxVolume24hUsd
   * @param queryOptions.minMarketCap
   * @param queryOptions.maxMarketCap
   * @param options
   */
  async fetchV3PopularTokens(
    chainIds: string[],
    queryOptions?: {
      blockRegion?: 'global' | 'us';
      minLiquidity?: number;
      minVolume24hUsd?: number;
      maxVolume24hUsd?: number;
      minMarketCap?: number;
      maxMarketCap?: number;
    },
    options?: FetchOptions,
  ): Promise<TrendingToken[]> {
    return this.#queryClient.fetchQuery({
      queryKey: queryKeys.tokens.v3Popular(chainIds),
      queryFn: ({ signal }) =>
        this.#fetch<TrendingToken[]>(API_URLS.TOKEN, '/v3/tokens/popular', {
          signal,
          params: {
            chainIds,
            blockRegion: queryOptions?.blockRegion,
            minLiquidity: queryOptions?.minLiquidity,
            minVolume24hUsd: queryOptions?.minVolume24hUsd,
            maxVolume24hUsd: queryOptions?.maxVolume24hUsd,
            minMarketCap: queryOptions?.minMarketCap,
            maxMarketCap: queryOptions?.maxMarketCap,
          },
        }),
      staleTime: options?.staleTime ?? STALE_TIMES.TRENDING,
      gcTime: options?.gcTime ?? GC_TIMES.SHORT,
    });
  }

  // ==========================================================================
  // TOKENS API - TOP ASSETS
  // ==========================================================================

  /**
   * Get top assets for a chain.
   *
   * @param chainId
   * @param options
   */
  async fetchTopAssets(
    chainId: number,
    options?: FetchOptions,
  ): Promise<TopAsset[]> {
    return this.#queryClient.fetchQuery({
      queryKey: queryKeys.tokens.topAssets(chainId),
      queryFn: ({ signal }) =>
        this.#fetch<TopAsset[]>(API_URLS.TOKEN, `/topAssets/${chainId}`, {
          signal,
        }),
      staleTime: options?.staleTime ?? STALE_TIMES.TRENDING,
      gcTime: options?.gcTime ?? GC_TIMES.SHORT,
    });
  }

  // ==========================================================================
  // TOKENS API - UTILITY
  // ==========================================================================

  /**
   * Get suggested occurrence floors for all chains.
   *
   * @param options
   */
  async fetchV1SuggestedOccurrenceFloors(
    options?: FetchOptions,
  ): Promise<SuggestedOccurrenceFloorsResponse> {
    return this.#queryClient.fetchQuery({
      queryKey: queryKeys.tokens.v1SuggestedOccurrenceFloors(),
      queryFn: ({ signal }) =>
        this.#fetch<SuggestedOccurrenceFloorsResponse>(
          API_URLS.TOKEN,
          '/v1/suggestedOccurrenceFloors',
          { signal },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.SUPPORTED_NETWORKS,
      gcTime: options?.gcTime ?? GC_TIMES.EXTENDED,
    });
  }

  // ==========================================================================
  // TOKENS API - V3 ASSETS
  // ==========================================================================

  /**
   * Fetch assets by IDs (v3) with caching.
   *
   * @param assetIds
   * @param options
   */
  async fetchV3Assets(
    assetIds: string[],
    options?: FetchOptions,
  ): Promise<AssetByIdResponse[]> {
    return this.#queryClient.fetchQuery({
      queryKey: queryKeys.tokens.v3Assets(assetIds),
      queryFn: ({ signal }) =>
        this.#fetch<AssetByIdResponse[]>(API_URLS.TOKENS, '/v3/assets', {
          signal,
          params: { assetIds },
        }),
      staleTime: options?.staleTime ?? STALE_TIMES.TOKEN_METADATA,
      gcTime: options?.gcTime ?? GC_TIMES.EXTENDED,
    });
  }

  // ==========================================================================
  // CACHE MANAGEMENT
  // ==========================================================================

  /**
   * Get cached data for a query key.
   *
   * @param queryKey
   */
  getCachedData<T>(queryKey: QueryKey): T | undefined {
    return this.#queryClient.getQueryData<T>(queryKey);
  }

  /**
   * Set cached data for a query key.
   *
   * @param queryKey
   * @param data
   */
  setCachedData<T>(queryKey: QueryKey, data: T): void {
    this.#queryClient.setQueryData(queryKey, data);
  }

  /**
   * Invalidate the cached auth token.
   * Call this when the user logs out or the token expires.
   */
  async invalidateAuthToken(): Promise<void> {
    await this.#queryClient.invalidateQueries({
      queryKey: queryKeys.auth.bearerToken(),
    });
  }

  /**
   * Invalidate all balance queries.
   */
  async invalidateBalances(): Promise<void> {
    await this.#queryClient.invalidateQueries({
      queryKey: queryKeys.accounts.balances.all,
    });
  }

  /**
   * Invalidate all price queries.
   */
  async invalidatePrices(): Promise<void> {
    await this.#queryClient.invalidateQueries({
      queryKey: queryKeys.prices.all,
    });
  }

  /**
   * Invalidate all token queries.
   */
  async invalidateTokens(): Promise<void> {
    await this.#queryClient.invalidateQueries({
      queryKey: queryKeys.tokens.all,
    });
  }

  /**
   * Invalidate all account queries.
   */
  async invalidateAccounts(): Promise<void> {
    await this.#queryClient.invalidateQueries({
      queryKey: queryKeys.accounts.all,
    });
  }

  /**
   * Invalidate all queries.
   */
  async invalidateAll(): Promise<void> {
    await this.#queryClient.invalidateQueries();
  }

  /**
   * Clear all cached data.
   */
  clear(): void {
    this.#queryClient.clear();
  }

  /**
   * Check if a query is currently fetching.
   *
   * @param queryKey
   */
  isFetching(queryKey: QueryKey): boolean {
    return this.#queryClient.isFetching({ queryKey }) > 0;
  }

  /**
   * Get the underlying QueryClient (for advanced usage).
   */
  get queryClient(): QueryClient {
    return this.#queryClient;
  }
}

/**
 * Factory function to create an ApiPlatformClient.
 *
 * @param options
 */
export function createApiPlatformClient(
  options: ApiPlatformClientOptions,
): ApiPlatformClient {
  return new ApiPlatformClient(options);
}
