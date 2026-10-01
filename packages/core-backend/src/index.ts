// Core Backend Package Exports

// ============================================================================
// BACKEND WEBSOCKET SERVICE
// ============================================================================

export {
  BackendWebSocketService,
  getCloseReason,
  WebSocketState,
  WebSocketEventType,
} from './ws/BackendWebSocketService.js';

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
  BackendWebSocketServiceConnectionStateChangedEvent,
  BackendWebSocketServiceEvents,
  BackendWebSocketServiceMessenger,
} from './ws/BackendWebSocketService.js';

// ============================================================================
// ACCOUNT ACTIVITY SERVICE
// ============================================================================

export {
  AccountActivityService,
  ACCOUNT_ACTIVITY_SERVICE_ALLOWED_ACTIONS,
  ACCOUNT_ACTIVITY_SERVICE_ALLOWED_EVENTS,
} from './ws/AccountActivityService.js';

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
} from './ws/AccountActivityService.js';

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
} from './types.js';

// ============================================================================
// API PLATFORM CLIENT SERVICE
// ============================================================================

export {
  ApiPlatformClientService,
  apiPlatformClientServiceName,
} from './ApiPlatformClientService.js';

export type {
  ApiPlatformClientServiceOptions,
  ApiPlatformClientServiceActions,
  ApiPlatformClientServiceEvents,
  ApiPlatformClientServiceMessenger,
} from './ApiPlatformClientService.js';

// ============================================================================
// OHLCV SERVICE
// ============================================================================

export {
  OHLCVService,
  OHLCV_SERVICE_ALLOWED_ACTIONS,
  OHLCV_SERVICE_ALLOWED_EVENTS,
} from './ws/ohlcv/index.js';

export type {
  OHLCVBar,
  OHLCVSubscriptionOptions,
  OHLCVSystemNotificationData,
  OHLCVServiceOptions,
  OHLCVServiceActions,
  OHLCVServiceAllowedActions,
  OHLCVServiceBarUpdatedEvent,
  OHLCVServiceChainStatusChangedEvent,
  OHLCVServiceSubscriptionErrorEvent,
  OHLCVServiceEvents,
  OHLCVServiceAllowedEvents,
  OHLCVServiceMessenger,
} from './ws/ohlcv/index.js';

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
  V6_DEFI_POSITION_TYPES,
  // Helpers
  calculateRetryDelay,
  getQueryOptionsOverrides,
  shouldRetry,
  // Errors
  HttpError,
} from './api/index.js';

// ============================================================================
// API PLATFORM CLIENT TYPES
// ============================================================================

export type {
  // Client options
  ApiPlatformClientOptions,
  ApiUrls,
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
  // Prices API types
  V3SpotPricesResponse,
  CoinGeckoSpotPrice,
  ExchangeRateInfo,
  V1ExchangeRatesResponse,
  PriceSupportedNetworksResponse,
  PriceV1SupportedNetworksResponse,
  PriceV2SupportedNetworksResponse,
  V1HistoricalPricesResponse,
  V3HistoricalPricesResponse,
  // Token API types
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
  // Tokens API types
  V1TokenSupportedNetworksResponse,
  V2TokenSupportedNetworksResponse,
  V3AssetResponse,
} from './api/index.js';
