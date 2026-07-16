/**
 * PerpsController - Protocol-agnostic perpetuals trading controller
 *
 * This module provides a unified interface for perpetual futures trading
 * across multiple protocols with high-performance real-time data handling.
 *
 * Key Features:
 * - Protocol abstraction (HyperLiquid first, extensible to GMX, dYdX, etc.)
 * - Dual data flow: Redux for persistence, direct callbacks for live data
 * - MetaMask native integration with BaseController pattern
 * - Mobile-optimized with throttling and performance considerations
 *
 * Usage:
 * ```typescript
 * import { usePerpsController } from './controllers';
 *
 * const { placeOrder, getPositions } = usePerpsController();
 * // Live prices hooks removed with Live Market Prices component
 *
 * // Place a market order
 * await placeOrder({
 *   coin: 'ETH',
 *   is_buy: true,
 *   sz: '0.1',
 *   order_type: 'market'
 * });
 * ```
 */

// Core controller and types
export {
  PerpsController,
  getDefaultPerpsControllerState,
  InitializationState,
} from './PerpsController.js';
export type {
  PerpsControllerState,
  PerpsControllerOptions,
  PerpsControllerMessenger,
  PerpsControllerGetStateAction,
  PerpsControllerActions,
  PerpsControllerEvents,
} from './PerpsController.js';
export type {
  PerpsControllerCalculateFeesAction,
  PerpsControllerCalculateLiquidationPriceAction,
  PerpsControllerCalculateMaintenanceMarginAction,
  PerpsControllerCancelOrderAction,
  PerpsControllerCancelOrdersAction,
  PerpsControllerClearDepositResultAction,
  PerpsControllerClearPendingTradeConfigurationAction,
  PerpsControllerClearPendingTransactionRequestsAction,
  PerpsControllerClearWithdrawResultAction,
  PerpsControllerClosePositionAction,
  PerpsControllerClosePositionsAction,
  PerpsControllerClearAttributionContextAction,
  PerpsControllerCompleteWithdrawalFromHistoryAction,
  PerpsControllerDepositWithConfirmationAction,
  PerpsControllerDepositWithOrderAction,
  PerpsControllerDisconnectAction,
  PerpsControllerEditOrderAction,
  PerpsControllerFetchHistoricalCandlesAction,
  PerpsControllerFlipPositionAction,
  PerpsControllerGetAccountStateAction,
  PerpsControllerGetActiveProviderAction,
  PerpsControllerGetActiveProviderOrNullAction,
  PerpsControllerGetAttributionContextAction,
  PerpsControllerGetAvailableDexsAction,
  PerpsControllerGetBlockExplorerUrlAction,
  PerpsControllerGetCachedMarketDataForActiveProviderAction,
  PerpsControllerGetCachedUserDataForActiveProviderAction,
  PerpsControllerGetCurrentNetworkAction,
  PerpsControllerGetFundingAction,
  PerpsControllerGetHistoricalPortfolioAction,
  PerpsControllerGetMarketDataWithPricesAction,
  PerpsControllerGetMarketFilterPreferencesAction,
  PerpsControllerGetMarketCategoriesAction,
  PerpsControllerGetMarketsAction,
  PerpsControllerGetMaxLeverageAction,
  PerpsControllerGetOpenOrdersAction,
  PerpsControllerGetOrderBookGroupingAction,
  PerpsControllerGetOrderFillsAction,
  PerpsControllerGetOrdersAction,
  PerpsControllerGetPendingTradeConfigurationAction,
  PerpsControllerGetPositionsAction,
  PerpsControllerGetTradeConfigurationAction,
  PerpsControllerGetRecentlyViewedMarketsAction,
  PerpsControllerGetWatchlistMarketsAction,
  PerpsControllerGetWebSocketConnectionStateAction,
  PerpsControllerGetWithdrawalProgressAction,
  PerpsControllerGetWithdrawalRoutesAction,
  PerpsControllerInitAction,
  PerpsControllerIsCurrentlyReinitializingAction,
  PerpsControllerIsFirstTimeUserOnCurrentNetworkAction,
  PerpsControllerIsWatchlistMarketAction,
  PerpsControllerMarkFirstOrderCompletedAction,
  PerpsControllerMarkTutorialCompletedAction,
  PerpsControllerPlaceOrderAction,
  PerpsControllerReconnectAction,
  PerpsControllerRecordMarketViewedAction,
  PerpsControllerRefreshEligibilityAction,
  PerpsControllerResetFirstTimeUserStateAction,
  PerpsControllerResetSelectedPaymentTokenAction,
  PerpsControllerSaveMarketFilterPreferencesAction,
  PerpsControllerSaveOrderBookGroupingAction,
  PerpsControllerSavePendingTradeConfigurationAction,
  PerpsControllerSaveTradeConfigurationAction,
  PerpsControllerSetAttributionContextAction,
  PerpsControllerSetLiveDataConfigAction,
  PerpsControllerSetSelectedPaymentTokenAction,
  PerpsControllerStartEligibilityMonitoringAction,
  PerpsControllerStartMarketDataPreloadAction,
  PerpsControllerStopEligibilityMonitoringAction,
  PerpsControllerStopMarketDataPreloadAction,
  PerpsControllerSubscribeToAccountAction,
  PerpsControllerSubscribeToCandlesAction,
  PerpsControllerSubscribeToConnectionStateAction,
  PerpsControllerSubscribeToOICapsAction,
  PerpsControllerSubscribeToOrderBookAction,
  PerpsControllerSubscribeToOrderFillsAction,
  PerpsControllerSubscribeToOrdersAction,
  PerpsControllerSubscribeToPositionsAction,
  PerpsControllerSubscribeToPricesAction,
  PerpsControllerSwitchProviderAction,
  PerpsControllerToggleTestnetAction,
  PerpsControllerToggleWatchlistMarketAction,
  PerpsControllerUpdateMarginAction,
  PerpsControllerUpdatePositionTPSLAction,
  PerpsControllerUpdateWithdrawalProgressAction,
  PerpsControllerUpdateWithdrawalStatusAction,
  PerpsControllerValidateClosePositionAction,
  PerpsControllerValidateOrderAction,
  PerpsControllerValidateWithdrawalAction,
  PerpsControllerWithdrawAction,
} from './PerpsController-method-action-types.js';

// Provider interfaces and implementations
export { HyperLiquidProvider } from './providers/HyperLiquidProvider.js';

// Type definitions (explicit named exports)
export {
  WebSocketConnectionState,
  PerpsAnalyticsEvent,
  MARKET_CATEGORIES,
  MarketCategory,
} from './types/index.js';
export type {
  RawLedgerUpdate,
  UserHistoryItem,
  GetUserHistoryParams,
  TradeConfiguration,
  OrderType,
  MarketType,
  MarketTypeFilter,
  InputMethod,
  TradeAction,
  TrackingData,
  TPSLTrackingData,
  OrderParams,
  OrderResult,
  Position,
  AccountState,
  ClosePositionParams,
  ClosePositionsParams,
  ClosePositionsResult,
  UpdateMarginParams,
  MarginResult,
  FlipPositionParams,
  InitializeResult,
  ReadyToTradeResult,
  DisconnectResult,
  MarketInfo,
  PerpsMarketData,
  ToggleTestnetResult,
  AssetRoute,
  SwitchProviderResult,
  CancelOrderParams,
  CancelOrderResult,
  BatchCancelOrdersParams,
  CancelOrdersParams,
  CancelOrdersResult,
  EditOrderParams,
  DepositParams,
  DepositWithConfirmationParams,
  DepositResult,
  DepositStatus,
  DepositFlowType,
  DepositStepInfo,
  WithdrawParams,
  WithdrawResult,
  TransferBetweenDexsParams,
  TransferBetweenDexsResult,
  GetHistoricalPortfolioParams,
  HistoricalPortfolioResult,
  LiveDataConfig,
  PerpsControllerConfig,
  PriceUpdate,
  OrderFill,
  CheckEligibilityParams,
  GetPositionsParams,
  GetAccountStateParams,
  GetOrderFillsParams,
  GetOrFetchFillsParams,
  GetOrdersParams,
  GetFundingParams,
  GetSupportedPathsParams,
  GetAvailableDexsParams,
  GetMarketsParams,
  GetMarketDataWithPricesParams,
  SortField,
  SortDirection,
  SubscribePricesParams,
  SubscribePositionsParams,
  SubscribeOrderFillsParams,
  SubscribeOrdersParams,
  SubscribeAccountParams,
  SubscribeOICapsParams,
  SubscribeCandlesParams,
  OrderBookLevel,
  OrderBookData,
  SubscribeOrderBookParams,
  LiquidationPriceParams,
  MaintenanceMarginParams,
  FeeCalculationParams,
  FeeCalculationResult,
  UpdatePositionTPSLParams,
  Order,
  Funding,
  PerpsProvider,
  PerpsProviderType,
  PerpsActiveProviderMode,
  AggregationMode,
  RoutingStrategy,
  AggregatedProviderConfig,
  ProviderError,
  AggregatedAccountState,
  PerpsLogger,
  PerpsTraceName,
  PerpsTraceValue,
  PerpsAnalyticsProperties,
  PerpsAttributionContext,
  PerpsMetrics,
  PerpsDebugLogger,
  PerpsStreamManager,
  PerpsPerformance,
  PerpsTracer,
  PerpsTypedMessageParams,
  PerpsTransactionParams,
  PerpsAddTransactionOptions,
  PerpsInternalAccount,
  PerpsRemoteFeatureFlagState,
  PerpsPlatformDependencies,
  PerpsTerminalMarketService,
  TerminalAssetMetadata,
  PerpsCacheType,
  InvalidateCacheParams,
  PerpsCacheInvalidator,
  MarketDataFormatters,
  PaymentToken,
  PerpsSelectedPaymentToken,
  VersionGatedFeatureFlag,
} from './types/index.js';
export {
  PerpsTraceNames,
  PerpsTraceOperations,
  isVersionGatedFeatureFlag,
} from './types/index.js';

// Types from sub-modules (re-exported via types/index.ts)
export type {
  TestResultStatus,
  TestResult,
  SDKTestType,
  HyperliquidAsset,
  CandleStick,
  CandleData,
  OrderFormState,
  OrderDirection,
  ReconnectOptions,
  ExtendedAssetMeta,
  ExtendedPerpDex,
} from './types/index.js';
export type {
  BaseTransactionResult,
  LastTransactionResult,
  TransactionStatus,
  TransactionRecord,
} from './types/index.js';
export { isTransactionRecord, isLastTransactionResult } from './types/index.js';
export type {
  AssetPosition,
  SpotBalance,
  PerpsUniverse,
  PerpsAssetCtx,
  PredictedFunding,
  FrontendOrder,
  SDKOrderParams,
  ClearinghouseStateResponse,
  SpotClearinghouseStateResponse,
  MetaResponse,
  FrontendOpenOrdersResponse,
  AllMidsResponse,
  MetaAndAssetCtxsResponse,
  PredictedFundingsResponse,
  SpotMetaResponse,
} from './types/index.js';
export type {
  HyperLiquidEndpoints,
  AssetNetworkConfig,
  HyperLiquidAssetConfigs,
  BridgeContractConfig,
  HyperLiquidBridgeContracts,
  TransportReconnectConfig,
  TransportKeepAliveConfig,
  HyperLiquidTransportConfig,
  TradingAmountConfig,
  TradingDefaultsConfig,
  FeeRatesConfig,
  HyperLiquidNetwork,
} from './types/index.js';
export type { PerpsToken } from './types/index.js';

// Constants (explicit named exports)
export {
  CandlePeriod,
  TimeDuration,
  ChartInterval,
  MAX_CANDLE_COUNT,
  DURATION_CANDLE_PERIODS,
  CANDLE_PERIODS,
  DEFAULT_CANDLE_PERIOD,
  getCandlePeriodsForDuration,
  getDefaultCandlePeriodForDuration,
  calculateCandleCount,
} from './constants/index.js';
export { PERPS_EVENT_PROPERTY, PERPS_EVENT_VALUE } from './constants/index.js';
export { DETAILED_ORDER_TYPES, isTPSLOrder } from './constants/index.js';
export { PERPS_TRANSACTIONS_HISTORY_CONSTANTS } from './constants/index.js';
export {
  ARBITRUM_MAINNET_CHAIN_ID_HEX,
  ARBITRUM_MAINNET_CHAIN_ID,
  ARBITRUM_TESTNET_CHAIN_ID,
  ARBITRUM_MAINNET_CAIP_CHAIN_ID,
  ARBITRUM_TESTNET_CAIP_CHAIN_ID,
  HYPERLIQUID_MAINNET_CHAIN_ID,
  HYPERLIQUID_TESTNET_CHAIN_ID,
  HYPERLIQUID_MAINNET_CAIP_CHAIN_ID,
  HYPERLIQUID_TESTNET_CAIP_CHAIN_ID,
  HYPERLIQUID_NETWORK_NAME,
  USDC_SYMBOL,
  USDC_NAME,
  USDC_DECIMALS,
  TOKEN_DECIMALS,
  ZERO_ADDRESS,
  ZERO_BALANCE,
  ARBITRUM_SEPOLIA_CHAIN_ID,
  USDC_ETHEREUM_MAINNET_ADDRESS,
  USDC_ARBITRUM_MAINNET_ADDRESS,
  USDC_ARBITRUM_TESTNET_ADDRESS,
  USDC_TOKEN_ICON_URL,
  HYPERLIQUID_ENDPOINTS,
  HYPERLIQUID_ASSET_ICONS_BASE_URL,
  METAMASK_PERPS_ICONS_BASE_URL,
  HYPERLIQUID_ASSET_CONFIGS,
  HYPERLIQUID_BRIDGE_CONTRACTS,
  HYPERLIQUID_TRANSPORT_CONFIG,
  TRADING_DEFAULTS,
  FEE_RATES,
  HIP3_FEE_CONFIG,
  BUILDER_FEE_CONFIG,
  REFERRAL_CONFIG,
  DEPOSIT_CONFIG,
  HYPERLIQUID_WITHDRAWAL_MINUTES,
  getWebSocketEndpoint,
  getChainId,
  getCaipChainId,
  getBridgeInfo,
  getSupportedAssets,
  CAIP_ASSET_NAMESPACES,
  HYPERLIQUID_CONFIG,
  HIP3_ASSET_ID_CONFIG,
  BASIS_POINTS_DIVISOR,
  SPOT_ASSET_ID_OFFSET,
  HIP3_ASSET_MARKET_TYPES,
  TESTNET_HIP3_CONFIG,
  MAINNET_HIP3_CONFIG,
  HIP3_MARGIN_CONFIG,
  USDH_CONFIG,
  INITIAL_AMOUNT_UI_PROGRESS,
  WITHDRAWAL_PROGRESS_STAGES,
  PROGRESS_BAR_COMPLETION_DELAY_MS,
} from './constants/index.js';
export type { SupportedAsset } from './constants/index.js';
export { PerpsMeasurementName } from './constants/index.js';
export {
  MYX_MAINNET_CHAIN_ID,
  MYX_TESTNET_CHAIN_ID,
  MYX_MAINNET_CAIP_CHAIN_ID,
  MYX_TESTNET_CAIP_CHAIN_ID,
  getMYXChainId,
  MYX_ENDPOINTS,
  getMYXHttpEndpoint,
  MYX_PRICE_DECIMALS,
  MYX_SIZE_DECIMALS,
  MYX_COLLATERAL_DECIMALS,
  USDT_BNB_TESTNET,
  USDT_BNB_MAINNET,
  MYX_ASSET_CONFIGS,
  fromMYXPrice,
  toMYXPrice,
  fromMYXSize,
  toMYXSize,
  fromMYXCollateral,
  MYX_PRICE_POLLING_INTERVAL_MS,
  MYX_HTTP_TIMEOUT_MS,
  MYX_MAX_RETRIES,
  MYX_MAX_LEVERAGE,
  MYX_FEE_RATE,
  MYX_PROTOCOL_FEE_RATE,
  MYX_DEFAULT_SLIPPAGE_BPS,
  MYX_MINIMUM_ORDER_SIZE_USD,
  MYX_EXECUTION_FEE_TOKEN,
} from './constants/index.js';
export {
  PERPS_CONSTANTS,
  WITHDRAWAL_CONSTANTS,
  VALIDATION_THRESHOLDS,
  ORDER_SLIPPAGE_CONFIG,
  MAX_SLIPPAGE_BOUNDS,
  PERFORMANCE_CONFIG,
  TP_SL_CONFIG,
  HYPERLIQUID_ORDER_LIMITS,
  CLOSE_POSITION_CONFIG,
  MARGIN_ADJUSTMENT_CONFIG,
  DATA_LAKE_API_CONFIG,
  DECIMAL_PRECISION_CONFIG,
  MARKET_SORTING_CONFIG,
  PROVIDER_CONFIG,
  FUNDING_RATE_CONFIG,
} from './constants/index.js';
export type { SortOptionId } from './constants/index.js';

// Utilities (explicit named exports)
export {
  findEvmAccount,
  getEvmAccountFromAccountGroup,
  getSelectedEvmAccount,
  calculateWeightedReturnOnEquity,
  aggregateAccountStates,
} from './utils/index.js';
export type { ReturnOnEquityInput } from './utils/index.js';
export { ensureError, isAbortError } from './utils/index.js';
export type {
  OrderBookCacheEntry,
  ProcessL2BookDataParams,
  ProcessBboDataParams,
} from './utils/index.js';
export { processL2BookData, processBboData } from './utils/index.js';
export type { ValidationDebugLogger } from './utils/index.js';
export {
  createErrorResult,
  validateWithdrawalParams,
  validateDepositParams,
  validateAssetSupport,
  validateBalance,
  applyPathFilters,
  getSupportedPaths,
  getMaxOrderValue,
  validateOrderParams,
  validateCoinExists,
} from './utils/index.js';
export {
  generatePerpsId,
  generateDepositId,
  generateWithdrawalId,
  generateOrderId,
  generateTransactionId,
} from './utils/index.js';
export {
  calculateOpenInterestUSD,
  isMarketTradable,
  transformMarketData,
  formatChange,
} from './utils/index.js';
export type { HyperLiquidMarketData } from './utils/index.js';
export {
  getPerpsConnectionAttemptContext,
  withPerpsConnectionAttemptContext,
} from './utils/perpsConnectionAttemptContext.js';
export type { PerpsConnectionAttemptContext } from './utils/perpsConnectionAttemptContext.js';
export {
  MAX_MARKET_PATTERN_LENGTH,
  escapeRegex,
  validateMarketPattern,
  compileMarketPattern,
  matchesMarketPattern,
  shouldIncludeMarket,
  getPerpsDisplaySymbol,
  getPerpsDexFromSymbol,
  calculateFundingCountdown,
  calculate24hHighLow,
  filterMarketsByQuery,
  matchesCategory,
  getMarketTypeFilter,
  applyMarketFilters,
  isHip3Market,
  rankMarketsByQuery,
  getMarketMatchRank,
} from './utils/index.js';
export { MarketMatchRank } from './utils/index.js';
export type { MarketPatternMatcher, CompiledMarketPattern } from './utils/index.js';
export type {
  OrderCalculationsDebugLogger,
  CalculateFinalPositionSizeParams,
  CalculateFinalPositionSizeResult,
  CalculateOrderPriceAndSizeParams,
  CalculateOrderPriceAndSizeResult,
  BuildOrdersArrayParams,
  BuildOrdersArrayResult,
} from './utils/index.js';
export {
  calculatePositionSize,
  calculateMarginRequired,
  getMaxAllowedAmount,
  calculateFinalPositionSize,
  calculateOrderPriceAndSize,
  buildOrdersArray,
} from './utils/index.js';
export {
  formatAccountToCaipAccountId,
  isCaipAccountId,
  handleRewardsError,
} from './utils/index.js';
export {
  countSignificantFigures,
  hasExceededSignificantFigures,
  roundToSignificantFigures,
} from './utils/index.js';
export type { SortMarketsParams } from './utils/index.js';
export { parseVolume, sortMarkets } from './utils/index.js';
export type { StandaloneInfoClientOptions } from './utils/index.js';
export {
  createStandaloneInfoClient,
  queryStandaloneClearinghouseStates,
  queryStandaloneOpenOrders,
} from './utils/index.js';
export { stripQuotes, parseCommaSeparatedString } from './utils/index.js';
export { generateERC20TransferData } from './utils/index.js';
export { wait } from './utils/index.js';
export {
  adaptOrderToSDK,
  adaptPositionFromSDK,
  adaptOrderFromSDK,
  adaptMarketFromSDK,
  adaptAccountStateFromSDK,
  buildAssetMapping,
  formatHyperLiquidPrice,
  formatHyperLiquidSize,
  calculateHip3AssetId,
  parseAssetName,
  adaptHyperLiquidLedgerUpdateToUserHistoryItem,
} from './utils/index.js';
export { getEnvironment } from './utils/index.js';
export type { FiatRangeConfig } from './utils/index.js';
export {
  PRICE_THRESHOLD,
  formatWithSignificantDigits,
  PRICE_RANGES_MINIMAL_VIEW,
  PRICE_RANGES_UNIVERSAL,
  formatPerpsFiat,
  formatPositionSize,
  formatPnl,
  formatPercentage,
  formatFundingRate,
} from './utils/index.js';

// Error codes (explicit named exports)
export { PERPS_ERROR_CODES } from './perpsErrorCodes.js';
export type { PerpsErrorCode } from './perpsErrorCodes.js';

// Selectors (explicit named exports)
export {
  selectIsFirstTimeUser,
  selectHasPlacedFirstOrder,
  selectWatchlistMarkets,
  selectIsWatchlistMarket,
  selectRecentlyViewedMarkets,
  selectTradeConfiguration,
  selectPendingTradeConfiguration,
  selectMarketFilterPreferences,
  selectOrderBookGrouping,
} from './selectors.js';

// Services (only externally consumed items)
export { TradingReadinessCache } from './services/TradingReadinessCache.js';
export type { ServiceContext } from './services/ServiceContext.js';

// Removed with Live Market Prices component:
// - usePerpsPrices
