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
} from './shared-types';
export {
  API_URLS,
  STALE_TIMES,
  GC_TIMES,
  RETRY_CONFIG,
  calculateRetryDelay,
  getQueryOptionsOverrides,
  shouldRetry,
  HttpError,
} from './shared-types';

// Accounts API
export { AccountsApiClient } from './accounts';
export type {
  V5BalanceItem,
  V5BalancesResponse,
  V2BalanceItem,
  V2BalancesResponse,
  V4BalancesResponse,
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
} from './accounts';

// Prices API
export { PricesApiClient } from './prices';
export type {
  V3SpotPricesResponse,
  CoinGeckoSpotPrice,
  ExchangeRateInfo,
  V1ExchangeRatesResponse,
  PriceSupportedNetworksResponse,
  V1HistoricalPricesResponse,
  V3HistoricalPricesResponse,
} from './prices';

// Token API
export { TokenApiClient } from './token';
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
} from './token';

// Tokens API
export { TokensApiClient } from './tokens';
export type {
  V1TokenSupportedNetworksResponse,
  V2TokenSupportedNetworksResponse,
  V3AssetResponse,
} from './tokens';

// Base client
export { BaseApiClient } from './base-client';
export type { InternalFetchOptions } from './base-client';

// API Platform Client (unified client)
export {
  ApiPlatformClient,
  createApiPlatformClient,
} from './ApiPlatformClient';
