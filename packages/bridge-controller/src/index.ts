export { BridgeController } from './bridge-controller';

export {
  BatchSellMetricsEventName,
  UnifiedSwapBridgeEventName,
  BATCH_SELL_EVENT_CATEGORY,
  UNIFIED_SWAP_BRIDGE_EVENT_CATEGORY,
  BatchSellMetricsLocation,
  InputAmountPreset,
  MetaMetricsSwapsEventSource,
  PollingStatus,
} from './utils/metrics/constants';

export type { BridgeControllerMetricsEventName } from './utils/metrics/constants';
export type { BridgeControllerMetricsLocation } from './utils/metrics/constants';

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
} from './utils/metrics/types';

export {
  getAccountHardwareType,
  formatProviderLabel,
  getRequestParams,
  getSwapType,
  isHardwareWallet,
  isCustomSlippage,
  getQuotesReceivedProperties,
} from './utils/metrics/properties';

export type {
  ChainConfiguration,
  L1GasFees,
  NonEvmFees,
  GasMultiplierByChainId,
  FeatureFlagResponse,
  BridgeAsset,
  GenericQuoteRequest,
  BatchSellTradesResponse,
  GaslessProperties,
  SimulatedGasFeeLimits,
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
  DeepPartial,
} from './types';

export {
  AssetType,
  SortOrder,
  ChainId,
  RequestStatus,
  StatusTypes,
} from './types';

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
} from './bridge-controller-method-action-types';

export { AbortReason } from './utils/metrics/constants';

export type {
  TxData,
  BitcoinTradeData,
  TronTradeData,
  StellarTradeData,
  Trade,
} from './validators/trade';
export {
  isBitcoinTrade,
  isTronTrade,
  isEvmTxData,
  isStellarTrade,
} from './validators/trade';
export type { QuoteResponseV1 as QuoteResponse } from './validators/quote-response-v1';
export type { Quote } from './validators/quote';
export { FeeType, DiscountType } from './validators/quote';
export { ActionTypes } from './validators/step';
export {
  type QuoteResponseV1,
  validateQuoteResponseV1,
  QuoteResponseSchemaV1,
} from './validators/quote-response-v1';

export {
  type QuoteMetadata,
  type TokenAmountValues,
} from './utils/quote-metadata/types';

export { calcQuoteMetadata } from './utils/quote-metadata/quote-metadata';
export { mergeQuoteMetadata } from './utils/quote-metadata/merge';

export {
  validateQuoteStreamComplete,
  QuoteStreamCompleteReason,
} from './validators/quote-stream-complete';
export { BatchSellTransactionType } from './validators/batch-sell';
export { TokenFeatureType } from './validators/token-feature';
export {
  BridgeAssetSchema,
  validateBridgeAsset,
} from './validators/bridge-asset';
export { FeatureId } from './validators/feature-flags';

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
} from './constants/bridge';

export type { AllowedBridgeChainIds } from './constants/bridge';

export {
  /**
   * @deprecated This type should not be used. Use {@link BridgeAsset} instead.
   */
  type SwapsTokenObject,
  /**
   * @deprecated This map should not be used. Use getNativeAssetForChainId" } instead.
   */
  SWAPS_CHAINID_DEFAULT_TOKEN_MAP,
} from './constants/tokens';

export {
  SWAPS_API_V2_BASE_URL,
  SWAPS_CONTRACT_ADDRESSES,
  SWAPS_WRAPPED_TOKENS_ADDRESSES,
  ALLOWED_CONTRACT_ADDRESSES,
} from './constants/swaps';

export { MetricsActionType, MetricsSwapType } from './utils/metrics/constants';

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
} from './utils/bridge';

export {
  isValidQuoteRequest,
  isValidBatchSellQuoteRequest,
} from './validators/quote-request';

export { calcSlippagePercentage } from './utils/quote-metadata/calculators';

export { calcLatestSrcBalance } from './utils/balance';

export {
  fetchBridgeTokens,
  getClientHeaders,
  fetchBridgeQuoteStream,
} from './utils/fetch';

export { appendFeesToQuotes } from './utils/quote-fees';

export {
  formatChainIdToCaip,
  formatChainIdToHex,
  formatAddressToCaipReference,
  formatAddressToAssetId,
} from './utils/caip-formatters';

export { extractTradeData } from './utils/trade-utils';

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
} from './selectors';

export { DEFAULT_FEATURE_FLAG_CONFIG } from './constants/bridge';

export { getBridgeFeatureFlags } from './utils/feature-flags';

export { BRIDGE_DEFAULT_SLIPPAGE } from './utils/slippage';

export {
  isValidSwapsContractAddress,
  getSwapsContractAddress,
  fetchTokens,
  type SwapsToken,
} from './utils/swaps';
