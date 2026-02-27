// Core Backend Package Exports

// ============================================================================
// BACKEND WEBSOCKET SERVICE
// ============================================================================

export {
  BackendWebSocketService,
  getCloseReason,
  WebSocketState,
  WebSocketEventType,
} from './BackendWebSocketService';

export type {
  BackendWebSocketServiceOptions,
  ClientRequestMessage,
  ServerResponseMessage,
  ServerNotificationMessage,
  WebSocketMessage,
  ChannelCallback,
  WebSocketSubscription,
  WebSocketConnectionInfo,
  BackendWebSocketServiceActions,
  BackendWebSocketServiceGetConnectionInfoAction,
  BackendWebSocketServiceConnectionStateChangedEvent,
  BackendWebSocketServiceEvents,
  BackendWebSocketServiceMessenger,
} from './BackendWebSocketService';

// ============================================================================
// ACCOUNT ACTIVITY SERVICE
// ============================================================================

export {
  AccountActivityService,
  ACCOUNT_ACTIVITY_SERVICE_ALLOWED_ACTIONS,
  ACCOUNT_ACTIVITY_SERVICE_ALLOWED_EVENTS,
} from './AccountActivityService';

export type {
  SystemNotificationData,
  SubscriptionOptions,
  AccountActivityServiceOptions,
  AccountActivityServiceActions,
  AllowedActions as AccountActivityServiceAllowedActions,
  AccountActivityServiceTransactionUpdatedEvent,
  AccountActivityServiceBalanceUpdatedEvent,
  AccountActivityServiceSubscriptionErrorEvent,
  AccountActivityServiceStatusChangedEvent,
  AccountActivityServiceEvents,
  AllowedEvents as AccountActivityServiceAllowedEvents,
  AccountActivityServiceMessenger,
} from './AccountActivityService';

// ============================================================================
// SHARED TYPES
// ============================================================================

export type {
  Transaction,
  Asset,
  Balance,
  Transfer,
  BalanceUpdate,
  AccountActivityMessage,
} from './types';

// ============================================================================
// API PLATFORM CLIENT SERVICE
// ============================================================================

export {
  ApiPlatformClientService,
  apiPlatformClientServiceName,
} from './ApiPlatformClientService';

export type {
  ApiPlatformClientServiceOptions,
  ApiPlatformClientServiceActions,
  ApiPlatformClientServiceEvents,
  ApiPlatformClientServiceMessenger,
} from './ApiPlatformClientService';

// ============================================================================
// API PLATFORM CLIENT
// ============================================================================

export {
  ApiPlatformClient,
  createApiPlatformClient,
  // Individual API clients
  AccountsApiClient,
  PricesApiClient,
  TokenApiClient,
  TokensApiClient,
  // Constants
  API_URLS,
  STALE_TIMES,
  GC_TIMES,
  // Helpers
  calculateRetryDelay,
  getQueryOptionsOverrides,
  shouldRetry,
  // Errors
  HttpError,
} from './api';

// ============================================================================
// API PLATFORM CLIENT TYPES
// ============================================================================

export type {
  // Client options
  ApiPlatformClientOptions,
  FetchOptions,
  // Shared types
  PageInfo,
  SupportedCurrency,
  MarketDataDetails,
  // Accounts API types
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
  // Prices API types
  V3SpotPricesResponse,
  CoinGeckoSpotPrice,
  ExchangeRateInfo,
  V1ExchangeRatesResponse,
  PriceSupportedNetworksResponse,
  V1HistoricalPricesResponse,
  V3HistoricalPricesResponse,
  // Token API types
  TokenMetadata,
  V1TokenDescriptionResponse,
  NetworkInfo,
  TopAsset,
  TrendingSortBy,
  TrendingToken,
  TopGainersSortOption,
  TrendingSortOption,
  V1SuggestedOccurrenceFloorsResponse,
  // Tokens API types
  V1TokenSupportedNetworksResponse,
  V2TokenSupportedNetworksResponse,
  V3AssetResponse,
} from './api';
