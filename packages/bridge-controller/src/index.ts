export { BridgeController } from './bridge-controller';

export {
  UnifiedSwapBridgeEventName,
  UNIFIED_SWAP_BRIDGE_EVENT_CATEGORY,
} from './utils/metrics/constants';

export type {
  RequiredEventContextFromClient,
  CrossChainSwapsEventProperties,
  TradeData,
  RequestParams,
  RequestMetadata,
  TxStatusData,
} from './utils/metrics/types';

export {
  formatProviderLabel,
  getRequestParams,
  getActionType,
  getSwapType,
  isHardwareWallet,
  isCustomSlippage,
} from './utils/metrics/properties';

export type {
  ChainConfiguration,
  L1GasFees,
  SolanaFees,
  QuoteMetadata,
  BridgeToken,
  GasMultiplierByChainId,
  FeatureFlagResponse,
  BridgeAsset,
  GenericQuoteRequest,
  Protocol,
  TokenAmountValues,
  Step,
  RefuelData,
  Quote,
  QuoteResponse,
  FeeData,
  TxData,
  BridgeControllerState,
  BridgeControllerAction,
  BridgeControllerActions,
  BridgeControllerEvents,
  BridgeControllerMessenger,
  FeatureFlagsPlatformConfig,
} from './types';

export { StatusTypes } from './types';

export {
  AssetType,
  SortOrder,
  ActionTypes,
  ChainId,
  RequestStatus,
  BridgeUserAction,
  BridgeBackgroundAction,
  FeeType,
} from './types';

export {
  ALLOWED_BRIDGE_CHAIN_IDS,
  BridgeClientId,
  BRIDGE_CONTROLLER_NAME,
  BRIDGE_QUOTE_MAX_ETA_SECONDS,
  BRIDGE_QUOTE_MAX_RETURN_DIFFERENCE_PERCENTAGE,
  BRIDGE_PREFERRED_GAS_ESTIMATE,
  BRIDGE_DEFAULT_SLIPPAGE,
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

export { SWAPS_API_V2_BASE_URL } from './constants/swaps';

export {
  getEthUsdtResetData,
  isEthUsdt,
  isNativeAddress,
  isSolanaChainId,
  getNativeAssetForChainId,
  getDefaultBridgeControllerState,
} from './utils/bridge';

export { isValidQuoteRequest, formatEtaInMinutes } from './utils/quote';

export { calcLatestSrcBalance } from './utils/balance';

export { fetchBridgeTokens } from './utils/fetch';

export {
  formatChainIdToCaip,
  formatChainIdToHex,
  formatAddressToCaipReference,
} from './utils/caip-formatters';

export {
  selectBridgeQuotes,
  type BridgeAppState,
  selectExchangeRateByChainIdAndAddress,
  /**
   * Returns whether a quote is expired
   *
   * @param state The state of the bridge controller and its dependency controllers
   * @param currentTimeInMs The current timestamp in milliseconds (e.g. `Date.now()`)
   * @returns Whether the quote is expired
   */
  selectIsQuoteExpired,
  selectBridgeFeatureFlags,
} from './selectors';
