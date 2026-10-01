/**
 * API barrel export.
 * Re-exports all types and clients from the API folder.
 */

// Shared types and utilities
export type {
  PageInfo,
  SupportedCurrency,
  MarketDataDetails,
  ApiPlatformClientOptions,
  ApiUrls,
  FetchOptions,
} from './shared-types.js';
export {
  API_URLS,
  STALE_TIMES,
  GC_TIMES,
  DEFAULT_AUTH_TOKEN_TIMEOUT,
  RETRY_CONFIG,
  calculateRetryDelay,
  getQueryOptionsOverrides,
  shouldRetry,
  HttpError,
} from './shared-types.js';

// Accounts API
export { AccountsApiClient, V6_DEFI_POSITION_TYPES } from './accounts/index.js';
export type {
  V5BalanceItem,
  V5BalancesResponse,
  V2BalanceItem,
  V2BalancesResponse,
  V4BalancesResponse,
  V6VsCurrency,
  V6DeFiPositionType,
  V6BalanceMetadata,
  V6StellarTokenBalanceMetadata,
  V6TokenBalanceMetadata,
  V6BalanceItem,
  V6BalancesResponse,
  V1SupportedNetworksResponse,
  V2SupportedNetworksResponse,
  V2ActiveNetworksResponse,
  V1TransactionByHashResponse,
  V1AccountTransactionsResponse,
  V4MultiAccountTransactionsResponse,
  ValueTransfer,
  V1AccountRelationshipResult,
  NftItem,
  V2NftsResponse,
  TokenDiscoveryItem,
  V2TokensResponse,
} from './accounts/index.js';

// Prices API
export { PricesApiClient } from './prices/index.js';
export type {
  V3SpotPricesResponse,
  CoinGeckoSpotPrice,
  ExchangeRateInfo,
  V1ExchangeRatesResponse,
  PriceSupportedNetworksResponse,
  PriceV1SupportedNetworksResponse,
  PriceV2SupportedNetworksResponse,
  V1HistoricalPricesResponse,
  V3HistoricalPricesResponse,
} from './prices/index.js';

// Token API
export { TokenApiClient } from './token/index.js';
export type {
  AssetsQueryOptions,
  MemeToken,
  MemeTokenRiskData,
  NetworkInfo,
  PopularTokensSortOption,
  RwaCustodian,
  RwaIndustry,
  RwaSortBy,
  RwaType,
  TokenBlockRegion,
  TokenCursorPageInfo,
  TokenFees,
  TokenListQueryOptions,
  TokenMetadata,
  TokenRwaData,
  TokenRwaMarketWindow,
  TokenRwaPause,
  TokenSearchQueryOptions,
  TokenSearchResponse,
  TokenSearchResult,
  TokenSecurityData,
  TokenSecurityFeature,
  TokenSecurityFees,
  TokenSecurityFinancialStats,
  TokenSecurityHolder,
  TokenSecurityMarket,
  TokenSecurityMetadata,
  TokenStorage,
  TokenV2SupportedNetworksResponse,
  TopAsset,
  TopGainersSortOption,
  TrendingSortBy,
  TrendingSortOption,
  TrendingToken,
  TrendingVsCurrency,
  V1Asset,
  V1AssetMarketData,
  V1Rwa,
  V1RwasQueryOptions,
  V1RwasResponse,
  V1SuggestedOccurrenceFloorsResponse,
  V1TokenDescriptionResponse,
  V1TokenMetadataQueryOptions,
  V1TokenSecurityDataQueryOptions,
  V1TokenSecurityDataResponse,
  V1TokenSecuritySummary,
  V1TokenSparkline,
  V1TokensSparklineCategory,
  V1TokensSparklineQueryOptions,
  V1TokensSparklineResponse,
  V1TokensSparklineSortOption,
  V2Asset,
  V2AssetMarketData,
  V3MemeTokensQueryOptions,
  V3MemeTokensResponse,
  V3PopularTokensQueryOptions,
  V3TokenDiscoveryQueryOptions,
  V3TopGainersQueryOptions,
  V3TrendingMemeTokensMaxMarketCap,
  V3TrendingMemeTokensMinLiquidity,
  V3TrendingMemeTokensMinMarketCap,
  V3TrendingMemeTokensQueryOptions,
  V3TrendingMemeTokensSortOption,
  V3TrendingMemeTokensTimeframe,
  V3TrendingTokensQueryOptions,
} from './token/index.js';

// Tokens API
export { TokensApiClient } from './tokens/index.js';
export type {
  V1TokenSupportedNetworksResponse,
  V2TokenSupportedNetworksResponse,
  V3AssetResponse,
} from './tokens/index.js';

// Base client
export { BaseApiClient } from './base-client.js';
export type { InternalFetchOptions } from './base-client.js';

// API Platform Client (unified client)
export {
  ApiPlatformClient,
  createApiPlatformClient,
} from './ApiPlatformClient.js';
