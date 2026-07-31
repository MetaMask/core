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
  FetchOptions,
} from './shared-types.js';
export {
  API_URLS,
  STALE_TIMES,
  GC_TIMES,
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
  V6TokenMetadata,
  V6BalanceItem,
  V6AccountBalancesEntry,
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
  V1HistoricalPricesResponse,
  V3HistoricalPricesResponse,
} from './prices/index.js';

// Token API
export { TokenApiClient } from './token/index.js';
export type {
  TokenMetadata,
  V1TokenDescriptionResponse,
  NetworkInfo,
  TopAsset,
  TrendingSortBy,
  TrendingToken,
  TopGainersSortOption,
  TrendingSortOption,
  V1SuggestedOccurrenceFloorsResponse,
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
