/**
 * Common types for MetaMask internal API services
 *
 * These types match the API documentation at:
 * - https://docs.cx.metamask.io/docs/apis/account-v2/api-reference/
 * - https://docs.cx.metamask.io/docs/apis/token/api-reference/
 * - https://docs.cx.metamask.io/docs/apis/token-v2/api-reference/
 * - https://docs.cx.metamask.io/docs/apis/price/api-reference/
 */

// =============================================================================
// Common Types
// =============================================================================

/**
 * API environment configuration
 */
export type ApiEnvironment = 'production' | 'development';

/**
 * Base API service options
 */
export type BaseApiServiceOptions = {
  /** Base URL for the API (optional, defaults to production) */
  baseUrl?: string;
  /** Request timeout in milliseconds (default: 10000) */
  timeout?: number;
  /** Function to get bearer token for authenticated requests */
  getBearerToken?: () => Promise<string | undefined>;
  /** Client product identifier (e.g., 'metamask-extension', 'metamask-mobile') */
  clientProduct?: string;
};

/**
 * Common API error response
 */
export type ApiErrorResponse = {
  error?: {
    code: string;
    message: string;
  };
};

/**
 * Pagination info for paginated responses
 */
export type PageInfo = {
  count: number;
  hasNextPage: boolean;
  cursor?: string;
};

// =============================================================================
// Token API Types (v1, v2, v3)
// =============================================================================

export const TOKEN_API_BASE_URL = 'https://token.api.cx.metamask.io';

/**
 * Token metadata from Token API v1 /tokens/{chainId} endpoint
 */
export type TokenMetadata = {
  address: string;
  symbol: string;
  decimals: number;
  name: string;
  iconUrl?: string;
  aggregators?: string[];
  occurrences?: number;
};

/**
 * Token search result from Token API /tokens/search endpoint
 */
export type TokenSearchResult = {
  address: string;
  chainId: string;
  symbol: string;
  name: string;
  decimals: number;
  iconUrl?: string;
  price?: string;
  priceChange24h?: number;
  marketCap?: number;
  volume24h?: number;
};

/**
 * Token search response from Token API /tokens/search endpoint
 */
export type TokenSearchResponse = {
  count: number;
  data: TokenSearchResult[];
  pageInfo?: PageInfo;
};

/**
 * Sort options for trending tokens (v3)
 */
export type TrendingSortBy =
  | 'm5_trending'
  | 'h1_trending'
  | 'h6_trending'
  | 'h24_trending';

/**
 * Trending token data from Token API v3 /tokens/trending endpoint
 */
export type TrendingToken = {
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
};

/**
 * Token list request options for v1 /tokens/{chainId} endpoint
 */
export type GetTokenListOptions = {
  /** Chain ID in hex format (e.g., '0x1') */
  chainId: string;
  /** Minimum occurrence count (default: 3) */
  occurrenceFloor?: number;
  /** Include native assets (default: false) */
  includeNativeAssets?: boolean;
  /** Include token fees (default: false) */
  includeTokenFees?: boolean;
  /** Include asset type (default: false) */
  includeAssetType?: boolean;
  /** Include ERC20 permit info (default: false) */
  includeERC20Permit?: boolean;
  /** Include storage info (default: false) */
  includeStorage?: boolean;
};

/**
 * Token search request options for /tokens/search endpoint
 */
export type SearchTokensOptions = {
  /** Array of CAIP format chain IDs (e.g., 'eip155:1', 'solana:mainnet') */
  chainIds: string[];
  /** Search query (token name, symbol, or address) */
  query: string;
  /** Maximum number of results (default: 10) */
  limit?: number;
  /** Include market data in results (default: false) */
  includeMarketData?: boolean;
};

/**
 * Trending tokens request options for v3 /tokens/trending endpoint
 */
export type GetTrendingTokensOptions = {
  /** Array of CAIP format chain IDs */
  chainIds: string[];
  /** Sort field */
  sortBy?: TrendingSortBy;
  /** Minimum liquidity */
  minLiquidity?: number;
  /** Minimum 24h volume in USD */
  minVolume24hUsd?: number;
  /** Maximum 24h volume in USD */
  maxVolume24hUsd?: number;
  /** Minimum market cap */
  minMarketCap?: number;
  /** Maximum market cap */
  maxMarketCap?: number;
};

/**
 * Token metadata request options for v1 /token/{chainId} endpoint
 */
export type GetTokenMetadataOptions = {
  /** Chain ID in hex format */
  chainId: string;
  /** Token contract address */
  tokenAddress: string;
};

// =============================================================================
// Accounts API Types (v1, v2, v4)
// =============================================================================

export const ACCOUNTS_API_BASE_URL = 'https://accounts.api.cx.metamask.io';

/**
 * Balance item from Accounts API v2/v4 endpoints
 * Matches the actual API response structure
 */
export type AccountsApiBalance = {
  /** Underlying object type. Always 'token' */
  object: string;
  /** Token type: 'native' for native chain tokens (e.g., ETH, POL) */
  type?: string;
  /** Timestamp (only provided for native chain tokens) */
  timestamp?: string;
  /** Token contract address */
  address: string;
  /** Token symbol */
  symbol: string;
  /** Token name */
  name: string;
  /** Token decimals */
  decimals: number;
  /** Chain ID (decimal) */
  chainId: number;
  /** Balance in decimal format (decimals adjusted), e.g., '123.456789' */
  balance: string;
  /** CAIP-10 account address (for v4 API responses) */
  accountAddress?: string;
};

/**
 * Response from Accounts API v2 /accounts/{address}/balances endpoint
 */
export type GetV2BalancesResponse = {
  /** Total number of balances */
  count: number;
  /** Array of balance items */
  balances: AccountsApiBalance[];
  /** Networks that failed to process. If no network is processed, returns HTTP 422 */
  unprocessedNetworks: number[];
};

/**
 * Response from Accounts API v4 /multiaccount/balances endpoint
 */
export type GetV4MultiAccountBalancesResponse = {
  /** Total number of balances */
  count: number;
  /** Array of balance items for all accounts */
  balances: AccountsApiBalance[];
  /** Networks that failed to process. If no network is processed, returns HTTP 422 */
  unprocessedNetworks: number[];
};

/**
 * Response from Accounts API v1 /supportedNetworks endpoint
 */
export type GetV1SupportedNetworksResponse = {
  /** Supported network chain IDs (decimal) */
  supportedNetworks: number[];
};

/**
 * Response from Accounts API v2 /supportedNetworks endpoint
 */
export type GetV2SupportedNetworksResponse = {
  /** Networks with full support */
  fullSupport: number[];
  /** Networks with partial support */
  partialSupport: {
    balances: number[];
  };
};

/**
 * Get balances request options for v2 endpoint
 */
export type GetBalancesOptions = {
  /** Account address */
  address: string;
  /** Networks to query (decimal chain IDs) */
  networks?: number[];
};

/**
 * Get multi-account balances request options for v4 endpoint
 */
export type GetMultiAccountBalancesOptions = {
  /** Account addresses in CAIP-10 format */
  accountAddresses: string[];
  /** Networks to query (decimal chain IDs) */
  networks?: number[];
};

/**
 * Account transaction from v1 /accounts/{address}/transactions endpoint
 */
export type AccountTransaction = {
  hash: string;
  timestamp: string;
  chainId: number;
  blockNumber: number;
  blockHash: string;
  gas: number;
  gasUsed: number;
  gasPrice: string;
  effectiveGasPrice: string;
  nonce: number;
  cumulativeGasUsed: number;
  methodId?: string;
  value: string;
  to: string;
  from: string;
  isError: boolean;
  valueTransfers: {
    contractAddress: string;
    decimal: number;
    symbol: string;
    from: string;
    to: string;
    amount: string;
  }[];
};

/**
 * Get account transactions response from v1 endpoint
 */
export type GetAccountTransactionsResponse = {
  data: AccountTransaction[];
  pageInfo: PageInfo;
};

/**
 * Get account transactions request options
 */
export type GetAccountTransactionsOptions = {
  /** Account address */
  address: string;
  /** Chain IDs in hex format (optional) */
  chainIds?: string[];
  /** Pagination cursor */
  cursor?: string;
  /** End timestamp filter */
  endTimestamp?: number;
  /** Sort direction */
  sortDirection?: 'ASC' | 'DESC';
  /** Start timestamp filter */
  startTimestamp?: number;
};

/**
 * Account address relationship result from v1 endpoint
 */
export type AccountRelationshipResult = {
  chainId?: number;
  count?: number;
  data?: {
    hash: string;
    timestamp: string;
    chainId: number;
    blockNumber: string;
    blockHash: string;
    gas: number;
    gasUsed: number;
    gasPrice: string;
    effectiveGasPrice: number;
    nonce: number;
    cumulativeGasUsed: number;
    methodId: string;
    value: string;
    to: string;
    from: string;
  };
  txHash?: string;
  error?: {
    code: string;
    message: string;
  };
};

/**
 * Get account relationship request options
 */
export type GetAccountRelationshipOptions = {
  /** Chain ID (decimal) */
  chainId: number;
  /** From address */
  from: string;
  /** To address */
  to: string;
};

// =============================================================================
// Price API Types (v1, v2, v3)
// =============================================================================

export const PRICE_API_BASE_URL = 'https://price.api.cx.metamask.io';

/**
 * Market data details from Price API spot-prices endpoint
 * Matches the actual API response structure
 */
export type MarketDataDetails = {
  /** Current price in the requested currency */
  price: number;
  /** Currency code (e.g., 'ETH', 'USD') */
  currency: string;
  /** 24h price change amount */
  priceChange1d: number;
  /** 24h price change percentage */
  pricePercentChange1d: number;
  /** 1h price change percentage */
  pricePercentChange1h: number;
  /** 7d price change percentage */
  pricePercentChange7d: number;
  /** 14d price change percentage */
  pricePercentChange14d: number;
  /** 30d price change percentage */
  pricePercentChange30d: number;
  /** 200d price change percentage */
  pricePercentChange200d: number;
  /** 1y price change percentage */
  pricePercentChange1y: number;
  /** Market capitalization */
  marketCap: number;
  /** Market cap 24h change percentage */
  marketCapPercentChange1d: number;
  /** All-time high price */
  allTimeHigh: number;
  /** All-time low price */
  allTimeLow: number;
  /** 24h high price */
  high1d: number;
  /** 24h low price */
  low1d: number;
  /** Total trading volume */
  totalVolume: number;
  /** Circulating supply */
  circulatingSupply: number;
  /** Diluted market cap */
  dilutedMarketCap: number;
};

/**
 * Response from Price API v1/v2 spot-prices endpoint (simple format)
 * Returns a map of token address to currency-price pairs
 */
export type GetTokenPricesResponse = {
  [tokenAddress: string]: {
    [currency: string]: number;
  };
};

/**
 * Response from Price API v3 spot-prices endpoint (with market data)
 * Returns a map of CAIP asset ID to market data
 */
export type GetTokenPricesWithMarketDataResponse = {
  [assetId: string]: MarketDataDetails;
};

/**
 * Get token prices request options
 */
export type GetTokenPricesOptions = {
  /** Chain ID in hex format */
  chainId: string;
  /** Token addresses to get prices for */
  tokenAddresses: string[];
  /** Currency to get prices in (e.g., 'usd', 'eth') */
  currency?: string;
  /** Include market data (24h change, market cap, etc.) */
  includeMarketData?: boolean;
};

/**
 * Response from Price API exchange-rates endpoint
 */
export type GetExchangeRatesResponse = {
  /** Map of currency code to rate */
  [currency: string]: number;
};

/**
 * Supported currencies for Price API
 * Matches the actual supported currencies list
 */
export type SupportedCurrency =
  // Crypto
  | 'btc'
  | 'eth'
  | 'ltc'
  | 'bch'
  | 'bnb'
  | 'eos'
  | 'xrp'
  | 'xlm'
  | 'link'
  | 'dot'
  | 'yfi'
  // Fiat
  | 'usd'
  | 'aed'
  | 'ars'
  | 'aud'
  | 'bdt'
  | 'bhd'
  | 'bmd'
  | 'brl'
  | 'cad'
  | 'chf'
  | 'clp'
  | 'cny'
  | 'czk'
  | 'dkk'
  | 'eur'
  | 'gbp'
  | 'gel'
  | 'hkd'
  | 'huf'
  | 'idr'
  | 'ils'
  | 'inr'
  | 'jpy'
  | 'krw'
  | 'kwd'
  | 'lkr'
  | 'mmk'
  | 'mxn'
  | 'myr'
  | 'ngn'
  | 'nok'
  | 'nzd'
  | 'php'
  | 'pkr'
  | 'pln'
  | 'rub'
  | 'sar'
  | 'sek'
  | 'sgd'
  | 'thb'
  | 'try'
  | 'twd'
  | 'uah'
  | 'vef'
  | 'vnd'
  | 'zar';

/**
 * Get historical prices request options
 */
export type GetHistoricalPricesOptions = {
  /** Chain ID in hex format */
  chainId: string;
  /** Token address */
  tokenAddress: string;
  /** Currency for prices */
  currency?: string;
  /** Time range: '1d', '7d', '30d', '90d', '1y', 'all' */
  timeRange?: '1d' | '7d' | '30d' | '90d' | '1y' | 'all';
};

/**
 * Historical price data point
 */
export type HistoricalPricePoint = {
  /** Timestamp in milliseconds */
  timestamp: number;
  /** Price at this timestamp */
  price: number;
};

/**
 * Get historical prices response
 */
export type GetHistoricalPricesResponse = {
  /** Array of price data points */
  prices: HistoricalPricePoint[];
};
