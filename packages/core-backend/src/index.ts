/**
 * @file Backend platform services for MetaMask.
 *
 * This package provides:
 * - Real-time WebSocket services for account activity monitoring
 * - ApiPlatformClient for MetaMask internal APIs (Accounts, Price, Token, Tokens)
 */

// Transaction and balance update types
export type {
  Transaction,
  Asset,
  Balance,
  Transfer,
  BalanceUpdate,
  AccountActivityMessage,
} from './types';

// WebSocket Service - following MetaMask Data Services pattern
export type {
  BackendWebSocketServiceOptions,
  WebSocketMessage,
  WebSocketConnectionInfo,
  WebSocketSubscription,
  BackendWebSocketServiceActions,
  BackendWebSocketServiceMessenger,
  BackendWebSocketServiceEvents,
  BackendWebSocketServiceConnectionStateChangedEvent,
  WebSocketState,
  WebSocketEventType,
  ServerNotificationMessage,
  ClientRequestMessage,
  ServerResponseMessage,
  ChannelCallback,
} from './BackendWebSocketService';
export { BackendWebSocketService } from './BackendWebSocketService';

// Account Activity Service
export type {
  SubscriptionOptions,
  AccountActivityServiceOptions,
  AccountActivityServiceActions,
  AccountActivityServiceTransactionUpdatedEvent,
  AccountActivityServiceBalanceUpdatedEvent,
  AccountActivityServiceSubscriptionErrorEvent,
  AccountActivityServiceStatusChangedEvent,
  AccountActivityServiceEvents,
  AccountActivityServiceMessenger,
} from './AccountActivityService';
export { AccountActivityService } from './AccountActivityService';

// =============================================================================
// API Platform Client
// =============================================================================

// API Platform Client (TanStack Query-enabled)
export {
  ApiPlatformClient,
  createApiPlatformClient,
  queryKeys,
  API_URLS,
  STALE_TIMES,
  GC_TIMES,
  HttpError,
} from './ApiPlatformClient';
export type {
  ApiPlatformClientOptions,
  FetchOptions,
  // Accounts API types
  V5BalanceItem,
  V5BalancesResponse,
  V2SupportedNetworksResponse,
  V1SupportedNetworksResponse,
  ActiveNetworksResponse,
  V2BalancesResponse,
  V4BalancesResponse,
  TransactionByHashResponse,
  AccountTransactionsResponse,
  V4MultiAccountTransactionsResponse,
  NftsResponse,
  TokensResponse,
  // Prices API types
  V3SpotPricesResponse,
  CoinGeckoSpotPrice,
  ExchangeRatesResponse,
  PriceSupportedNetworksResponse,
  V3HistoricalPricesResponse,
  // Token API types
  TokenSupportedNetworksResponse,
  TokenV2SupportedNetworksResponse,
  NetworkInfo,
  TopAsset,
  TokenDescriptionResponse,
  SuggestedOccurrenceFloorsResponse,
  TopGainersSortOption,
  TrendingSortOption,
  AssetByIdResponse,
} from './ApiPlatformClient';

// API Types
export type {
  // Base types
  ApiEnvironment,
  BaseApiServiceOptions,
  ApiErrorResponse,
  PageInfo,

  // Token types
  TokenMetadata,
  TokenSearchResult,
  TokenSearchResponse,
  TrendingSortBy,
  TrendingToken,
  GetTokenListOptions,
  SearchTokensOptions,
  GetTrendingTokensOptions,
  GetTokenMetadataOptions,

  // Accounts API types
  AccountsApiBalance,
  GetV2BalancesResponse,
  GetV4MultiAccountBalancesResponse,
  GetV1SupportedNetworksResponse,
  GetV2SupportedNetworksResponse,
  GetBalancesOptions,
  GetMultiAccountBalancesOptions,
  AccountTransaction,
  GetAccountTransactionsResponse,
  GetAccountTransactionsOptions,
  AccountRelationshipResult,
  GetAccountRelationshipOptions,

  // Price API types
  MarketDataDetails,
  GetTokenPricesResponse,
  GetTokenPricesWithMarketDataResponse,
  GetTokenPricesOptions,
  GetExchangeRatesResponse,
  SupportedCurrency,
  GetHistoricalPricesOptions,
  HistoricalPricePoint,
  GetHistoricalPricesResponse,
} from './api-types';

// API Base URLs
export { ACCOUNTS_API_BASE_URL, PRICE_API_BASE_URL } from './api-types';
