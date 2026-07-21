export { BridgeController } from './bridge-controller.js';

export {
  BatchSellMetricsEventName,
  UnifiedSwapBridgeEventName,
  BATCH_SELL_EVENT_CATEGORY,
  UNIFIED_SWAP_BRIDGE_EVENT_CATEGORY,
  BatchSellMetricsLocation,
  InputAmountPreset,
  MetaMetricsSwapsEventSource,
  PollingStatus,
} from './utils/metrics/constants.js';

export type { BridgeControllerMetricsEventName } from './utils/metrics/constants.js';
export type { BridgeControllerMetricsLocation } from './utils/metrics/constants.js';

export type {
  AccountHardwareType,
  RequiredEventContextFromClient,
  CrossChainSwapsEventProperties,
  TradeData,
  RequestParams,
  RequestMetadata,
  TxStatusData,
  QuoteFetchData,
  QuoteWarning,
  InputPrimaryDenominationData,
} from './utils/metrics/types.js';

export {
  getAccountHardwareType,
  formatProviderLabel,
  getRequestParams,
  getSwapType,
  isHardwareWallet,
  isCustomSlippage,
  getQuotesReceivedProperties,
} from './utils/metrics/properties.js';

export type {
  ChainConfiguration,
  L1GasFees,
  NonEvmFees,
  QuoteMetadata,
  GasMultiplierByChainId,
  FeatureFlagResponse,
  BridgeAsset,
  GenericQuoteRequest,
  BatchSellTradesResponse,
  GaslessProperties,
  SimulatedGasFeeLimits,
  TokenAmountValues,
  Step,
  RefuelData,
  FeeData,
  Intent,
  IntentOrderLike,
  BridgeControllerState,
  InputPrimaryDenomination,
  BridgeControllerAction,
  BridgeControllerActions,
  BridgeControllerEvents,
  BridgeControllerMessenger,
  FeatureFlagsPlatformConfig,
  TxFeeGasLimits,
  TokenFeature,
  QuoteStreamCompleteData,
  BridgeControllerGetStateAction,
  BridgeControllerStateChangeEvent,
} from './types.js';

export {
  AssetType,
  SortOrder,
  ChainId,
  RequestStatus,
  StatusTypes,
} from './types.js';

export type {
  BridgeControllerUpdateBridgeQuoteRequestParamsAction,
  BridgeControllerFetchQuotesAction,
  BridgeControllerStopPollingForQuotesAction,
  BridgeControllerSetLocationAction,
  BridgeControllerGetLocationAction,
  BridgeControllerSetInputPrimaryDenominationAction,
  BridgeControllerResetStateAction,
  BridgeControllerSetChainIntervalLengthAction,
  BridgeControllerTrackUnifiedSwapBridgeEventAction,
  BridgeControllerUpdateBatchSellTradesAction,
} from './bridge-controller-method-action-types.js';

export { AbortReason } from './utils/metrics/constants.js';

export type {
  TxData,
  BitcoinTradeData,
  TronTradeData,
  StellarTradeData,
  Trade,
} from './validators/trade.js';
export {
  isBitcoinTrade,
  isTronTrade,
  isEvmTxData,
  isStellarTrade,
} from './validators/trade.js';
export type { QuoteResponseV1 as QuoteResponse } from './validators/quote-response-v1.js';
export type { Quote } from './validators/quote.js';
export { FeeType, DiscountType } from './validators/quote.js';
export { ActionTypes } from './validators/step.js';
export {
  validateQuoteStreamComplete,
  QuoteStreamCompleteReason,
} from './validators/quote-stream-complete.js';
export { BatchSellTransactionType } from './validators/batch-sell.js';
export { TokenFeatureType } from './validators/token-feature.js';
export { BridgeAssetSchema } from './validators/bridge-asset.js';
export { FeatureId } from './validators/feature-flags.js';

export {
  ALLOWED_BRIDGE_CHAIN_IDS,
  BridgeClientId,
  BRIDGE_CONTROLLER_NAME,
  BRIDGE_QUOTE_MAX_ETA_SECONDS,
  BRIDGE_QUOTE_MAX_RETURN_DIFFERENCE_PERCENTAGE,
  BRIDGE_PREFERRED_GAS_ESTIMATE,
  BRIDGE_MM_FEE_RATE,
  REFRESH_INTERVAL_MS,
  DEFAULT_MAX_REFRESH_COUNT,
  DEFAULT_BRIDGE_CONTROLLER_STATE,
  METABRIDGE_CHAIN_TO_ADDRESS_MAP,
  BRIDGE_DEV_API_BASE_URL,
  BRIDGE_PROD_API_BASE_URL,
} from './constants/bridge.js';

export type { AllowedBridgeChainIds } from './constants/bridge.js';

export {
  /**
   * @deprecated This type should not be used. Use {@link BridgeAsset} instead.
   */
  type SwapsTokenObject,
  /**
   * @deprecated This map should not be used. Use getNativeAssetForChainId" } instead.
   */
  SWAPS_CHAINID_DEFAULT_TOKEN_MAP,
} from './constants/tokens.js';

export {
  SWAPS_API_V2_BASE_URL,
  SWAPS_CONTRACT_ADDRESSES,
  SWAPS_WRAPPED_TOKENS_ADDRESSES,
  ALLOWED_CONTRACT_ADDRESSES,
} from './constants/swaps.js';

export {
  MetricsActionType,
  MetricsSwapType,
} from './utils/metrics/constants.js';

export {
  isEthUsdt,
  isNativeAddress,
  isSolanaChainId,
  isBitcoinChainId,
  isTronChainId,
  isStellarChainId,
  isNonEvmChainId,
  getNativeAssetForChainId,
  getDefaultBridgeControllerState,
  isCrossChain,
} from './utils/bridge.js';

export {
  isValidQuoteRequest,
  isValidBatchSellQuoteRequest,
  formatEtaInMinutes,
  calcSlippagePercentage,
} from './utils/quote.js';

export { calcLatestSrcBalance } from './utils/balance.js';

export {
  fetchBridgeTokens,
  getClientHeaders,
  fetchBridgeQuoteStream,
} from './utils/fetch.js';

export { appendFeesToQuotes } from './utils/quote-fees.js';

export {
  formatChainIdToCaip,
  formatChainIdToHex,
  formatAddressToCaipReference,
  formatAddressToAssetId,
} from './utils/caip-formatters.js';

export { extractTradeData } from './utils/trade-utils.js';

export {
  selectBridgeQuotes,
  selectBatchSellQuotes,
  selectBatchSellTrades,
  selectDefaultSlippagePercentage,
  type BridgeAppState,
  selectExchangeRateByAssetId,
  selectIsQuoteExpired,
  selectBridgeFeatureFlags,
  selectMinimumBalanceForRentExemptionInSOL,
  selectTokenWarnings,
} from './selectors.js';

export { DEFAULT_FEATURE_FLAG_CONFIG } from './constants/bridge.js';

export { getBridgeFeatureFlags } from './utils/feature-flags.js';

export { BRIDGE_DEFAULT_SLIPPAGE } from './utils/slippage.js';

export {
  isValidSwapsContractAddress,
  getSwapsContractAddress,
  fetchTokens,
  type SwapsToken,
} from './utils/swaps.js';
