export { BridgeController } from './bridge-controller';

export type {
  AssetType,
  ChainConfiguration,
  L1GasFees,
  QuoteMetadata,
  SortOrder,
  BridgeToken,
  BridgeFlag,
  GasMultiplierByChainId,
  FeatureFlagResponse,
  BridgeAsset,
  QuoteRequest,
  Protocol,
  ActionTypes,
  Step,
  RefuelData,
  Quote,
  QuoteResponse,
  ChainId,
  FeeType,
  FeeData,
  TxData,
  BridgeFeatureFlagsKey,
  BridgeFeatureFlags,
  RequestStatus,
  BridgeUserAction,
  BridgeBackgroundAction,
  BridgeControllerState,
  BridgeControllerAction,
  BridgeControllerActions,
  BridgeControllerEvents,
  BridgeControllerMessenger,
} from './types';

export {
  ALLOWED_BRIDGE_CHAIN_IDS,
  BRIDGE_CLIENT_ID_EXTENSION,
  BRIDGE_CLIENT_ID_MOBILE,
  METABRIDGE_ETHEREUM_ADDRESS,
  BRIDGE_QUOTE_MAX_ETA_SECONDS,
  BRIDGE_QUOTE_MAX_RETURN_DIFFERENCE_PERCENTAGE,
  BRIDGE_PREFERRED_GAS_ESTIMATE,
  BRIDGE_DEFAULT_SLIPPAGE,
  BRIDGE_MM_FEE_RATE,
  REFRESH_INTERVAL_MS,
  DEFAULT_MAX_REFRESH_COUNT,
  DEFAULT_BRIDGE_CONTROLLER_STATE,
  METABRIDGE_CHAIN_TO_ADDRESS_MAP,
} from './constants/bridge';

export type { AllowedBridgeChainIds } from './constants/bridge';

export type { SwapsTokenObject } from './constants/tokens';

export { SWAPS_API_V2_BASE_URL } from './constants/swaps';

export {
  getEthUsdtResetData,
  isEthUsdt,
  getBridgeApiBaseUrl,
} from './utils/bridge';
