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
 * import { usePerpsController } from './controllers.js';
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
  PerpsMode,
  DEFAULT_ORDER_BOOK_PREFERENCES,
  DEFAULT_PERPS_MODE,
  DEFAULT_PRO_LAYOUT_PREFERENCES,
  DEFAULT_SELECTED_ORDER_TYPE,
} from './PerpsController.js';
export type {
  OrderBookListCurrency,
  OrderBookListMetric,
  OrderBookPreferences,
  PerpsControllerState,
  PerpsControllerOptions,
  PerpsControllerMessenger,
  PerpsControllerGetStateAction,
  PerpsControllerActions,
  PerpsControllerChaseOrderMaxDistanceReachedEvent,
  PerpsControllerEvents,
  ProLayoutPreferences,
  ProOrdersSideFilter,
  ProOrdersSortDirection,
  ProOrdersSortField,
  ProPositionsSideFilter,
  ProPositionsSortDirection,
  ProPositionsSortField,
} from './PerpsController.js';
export type {
  PerpsControllerApproveSubscriptionBuilderFeeAction,
  PerpsControllerCalculateFeesAction,
  PerpsControllerCalculateLiquidationPriceAction,
  PerpsControllerCalculateMaintenanceMarginAction,
  PerpsControllerPreviewPositionModifyAction,
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
  PerpsControllerGetUserDataSnapshotAction,
  PerpsControllerGetCurrentNetworkAction,
  PerpsControllerGetFundingAction,
  PerpsControllerGetChaseOrdersAction,
  PerpsControllerGetTwapOrdersAction,
  PerpsControllerGetHistoricalPortfolioAction,
  PerpsControllerGetMarketDataWithPricesAction,
  PerpsControllerGetMarketFilterPreferencesAction,
  PerpsControllerGetMarketCategoriesAction,
  PerpsControllerGetMarketsAction,
  PerpsControllerGetMaxLeverageAction,
  PerpsControllerGetOpenOrdersAction,
  PerpsControllerGetOrderBookGroupingAction,
  PerpsControllerGetOrderBookPreferencesAction,
  PerpsControllerGetOrderCapabilitiesAction,
  PerpsControllerGetScalePriceLadderAction,
  PerpsControllerGetOrderFillsAction,
  PerpsControllerGetOrdersAction,
  PerpsControllerGetPendingManualRecoveriesAction,
  PerpsControllerGetPendingTradeConfigurationAction,
  PerpsControllerGetPositionsAction,
  PerpsControllerGetSelectedOrderTypeAction,
  PerpsControllerGetRecoveredDispatchesAction,
  PerpsControllerAcknowledgeRecoveredDispatchAction,
  PerpsControllerGetTradeConfigurationAction,
  PerpsControllerGetRecentlyViewedMarketsAction,
  PerpsControllerGetWatchlistMarketsAction,
  PerpsControllerGetVisibleCandleCountAction,
  PerpsControllerGetWebSocketConnectionStateAction,
  PerpsControllerGetWithdrawalProgressAction,
  PerpsControllerGetWithdrawalRoutesAction,
  PerpsControllerInitAction,
  PerpsControllerInvalidateSubscriptionBenefitsAction,
  PerpsControllerIsCurrentlyReinitializingAction,
  PerpsControllerIsFirstTimeUserOnCurrentNetworkAction,
  PerpsControllerIsWatchlistMarketAction,
  PerpsControllerMarkFirstOrderCompletedAction,
  PerpsControllerMarkTutorialCompletedAction,
  PerpsControllerPlaceOrderAction,
  PerpsControllerPrepareTradingWalletAction,
  PerpsControllerReconnectAction,
  PerpsControllerRecordMarketViewedAction,
  PerpsControllerRefreshEligibilityAction,
  PerpsControllerResetFirstTimeUserStateAction,
  PerpsControllerResetSelectedPaymentTokenAction,
  PerpsControllerSaveMarketFilterPreferencesAction,
  PerpsControllerGetProLayoutPreferencesAction,
  PerpsControllerSetProLayoutPreferencesAction,
  PerpsControllerSetPerpsModeAction,
  PerpsControllerSetOrderBookPreferencesAction,
  PerpsControllerSetSelectedOrderTypeAction,
  PerpsControllerSaveOrderBookGroupingAction,
  PerpsControllerSavePendingTradeConfigurationAction,
  PerpsControllerSaveTradeConfigurationAction,
  PerpsControllerSetAttributionContextAction,
  PerpsControllerSetLiveDataConfigAction,
  PerpsControllerSetSelectedPaymentTokenAction,
  PerpsControllerSetVisibleCandleCountAction,
  PerpsControllerStartEligibilityMonitoringAction,
  PerpsControllerStartMarketDataPreloadAction,
  PerpsControllerSuspendChaseOrdersAction,
  PerpsControllerStopEligibilityMonitoringAction,
  PerpsControllerStopMarketDataPreloadAction,
  PerpsControllerSubscribeToAccountAction,
  PerpsControllerSubscribeToCandlesAction,
  PerpsControllerSubscribeToConnectionStateAction,
  PerpsControllerSubscribeToOICapsAction,
  PerpsControllerSubscribeToOrderBookAction,
  PerpsControllerSubscribeToOrderFillsAction,
  PerpsControllerSubscribeToOrdersAction,
  PerpsControllerSubscribeToTwapOrdersAction,
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
export { ChaseOrderSuspensionError } from './providers/AggregatedPerpsProvider.js';

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
  TriggerOrderType,
  StrategyOrderType,
  OrdinaryOrderType,
  OrderExecution,
  TriggerDirection,
  TpslLinkage,
  PositionTriggerOrder,
  MarketType,
  MarketTypeFilter,
  InputMethod,
  TradeAction,
  TrackingData,
  TPSLTrackingData,
  OrderParams,
  OrderResult,
  ScaleOrderChild,
  ChaseOrder,
  ChaseOrderMaxDistanceReached,
  ChaseOrderStatus,
  TwapOrder,
  TwapOrderFill,
  TwapOrderStatus,
  PerpsPendingManualRecovery,
  PerpsRecoveredDispatch,
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
  GetUserDataSnapshotParams,
  PerpsUserDataSnapshot,
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
  SubscribeTwapOrdersParams,
  SubscribeAccountParams,
  SubscribeOICapsParams,
  SubscribeCandlesParams,
  OrderBookLevel,
  OrderBookData,
  SubscribeOrderBookParams,
  LiquidationPriceParams,
  MaintenanceMarginParams,
  PositionModifyPreviewParams,
  PositionModifyPreviewResult,
  PositionModifyPreviewSource,
  PositionModifyPreviewKind,
  PositionPreviewValue,
  PositionModifyPreviewCurrent,
  PositionModifyPreviewOpen,
  PositionModifyPreviewFullClose,
  PositionModifyPreviewUnsupported,
  PositionModifyPreviewNone,
  FeeCalculationParams,
  FeeCalculationResult,
  GetOrderCapabilitiesParams,
  GetScalePriceLadderParams,
  OrderCapabilitiesUnavailableReason,
  DirectProviderOrderCapabilitiesUnavailableReason,
  RoutedOrderCapabilitiesUnavailableReason,
  DirectProviderScalePriceLadderUnavailableReason,
  ScalePriceLadderUnavailableReason,
  DirectProviderOrderCapabilities,
  PerpsOrderCapabilities,
  PerpsScalePriceLadder,
  PerpsSubscriptionBenefits,
  PerpsSubscriptionUsage,
  PerpsSubscriptionFeeWaiverStatus,
  PerpsFeeSource,
  PerpsFeeResolution,
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
  PerpsGlobalSnapshotRequest,
  PerpsGlobalSnapshotResult,
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
  VISIBLE_CANDLE_COUNT_CONFIG,
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
  INITIAL_AMOUNT_UI_PROGRESS,
  WITHDRAWAL_PROGRESS_STAGES,
  PROGRESS_BAR_COMPLETION_DELAY_MS,
} from './constants/index.js';
export type { SupportedAsset } from './constants/index.js';
export { PerpsMeasurementName } from './constants/index.js';
export {
  LIGHTER_MAINNET_CHAIN_ID,
  LIGHTER_TESTNET_CHAIN_ID,
  getLighterChainId,
  LIGHTER_ENDPOINTS,
  getLighterHttpEndpoint,
  LIGHTER_DEFAULT_API_KEY_INDEX,
  LIGHTER_HTTP_TIMEOUT_MS,
  LIGHTER_PRICE_POLLING_INTERVAL_MS,
  LIGHTER_MAX_LEVERAGE,
  toLighterInteger,
  fromLighterInteger,
  computeLighterMinOrderSize,
} from './constants/index.js';
export type {
  LighterNetwork,
  LighterCreateClientParams,
  LighterSignerBridge,
  LighterWebSocketCtor,
  LighterWebSocketLike,
  LighterWasmCall,
  LighterAuthConfig,
  LighterPersonalSigner,
} from './types/lighter-types.js';
export {
  PERPS_CONSTANTS,
  WITHDRAWAL_CONSTANTS,
  VALIDATION_THRESHOLDS,
  ORDER_SLIPPAGE_CONFIG,
  CHASE_ORDER_CONFIG,
  CHASE_ORDER_STATUS,
  MAX_SLIPPAGE_BOUNDS,
  PERFORMANCE_CONFIG,
  TP_SL_CONFIG,
  HYPERLIQUID_ORDER_LIMITS,
  HYPERLIQUID_TWAP_LIMITS,
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
  TRIGGER_ORDER_TYPES,
  STRATEGY_ORDER_TYPES,
  SCALE_ORDER_COUNT,
  isTriggerOrderType,
  isStrategyOrderType,
  isLimitExecutionOrderType,
  getTriggerExecution,
  getTriggerDirection,
  buildTriggerOrderType,
  buildPositionTriggerOrderFromOrder,
  computeScalePriceLadder,
  computeChaseQuotePrice,
  getPriceTick,
  splitScaleSizes,
} from './utils/index.js';
export {
  adaptTriggerOrderTypeFromSDK,
  adaptPositionTriggerOrderFromSDK,
  adaptTpslLinkageToGrouping,
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
export type {
  MarketPatternMatcher,
  CompiledMarketPattern,
} from './utils/index.js';
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
export {
  previewHyperLiquidIsolatedPositionModify,
  resolveHyperLiquidMarginTiers,
  buildMaintenanceSchedule,
  estimateIsolatedLiquidationPrice,
  estimateIsolatedLiquidationPriceAtTier,
} from './utils/index.js';
export type { HyperLiquidMarginTier } from './utils/index.js';
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
  selectOrderBookPreferences,
  selectProLayoutPreferences,
  selectSelectedOrderType,
  selectVisibleCandleCount,
  selectPerpsMode,
} from './selectors.js';

// Services (only externally consumed items)
export { TradingReadinessCache } from './services/TradingReadinessCache.js';
export type { ServiceContext } from './services/ServiceContext.js';
export type { AgentSigner } from './services/HyperLiquidWalletService.js';
export {
  AggregatedOrderBookConnection,
  processAggregatedOrderBook,
} from './services/AggregatedOrderBookConnection.js';
export type {
  OrderBookConnectionStatus,
  SubscribeAggregatedOrderBookParams,
  AggregatedOrderBookConnectionOptions,
} from './services/AggregatedOrderBookConnection.js';

// Removed with Live Market Prices component:
// - usePerpsPrices
