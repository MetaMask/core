export { default } from './bridge-controller';

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
  BRIDGE_CLIENT_ID,
  ETH_USDT_ADDRESS,
  METABRIDGE_ETHEREUM_ADDRESS,
  BRIDGE_QUOTE_MAX_ETA_SECONDS,
  BRIDGE_QUOTE_MAX_RETURN_DIFFERENCE_PERCENTAGE,
  BRIDGE_PREFERRED_GAS_ESTIMATE,
  BRIDGE_DEFAULT_SLIPPAGE,
  NETWORK_TO_SHORT_NETWORK_NAME_MAP,
  BRIDGE_MM_FEE_RATE,
  REFRESH_INTERVAL_MS,
  DEFAULT_MAX_REFRESH_COUNT,
  DEFAULT_BRIDGE_CONTROLLER_STATE,
  METABRIDGE_CHAIN_TO_ADDRESS_MAP,
} from './constants';

export type { AllowedBridgeChainIds } from './constants';

export {
  CURRENCY_SYMBOLS,
  ETH_SWAPS_TOKEN_OBJECT,
  BNB_SWAPS_TOKEN_OBJECT,
  MATIC_SWAPS_TOKEN_OBJECT,
  AVAX_SWAPS_TOKEN_OBJECT,
  TEST_ETH_SWAPS_TOKEN_OBJECT,
  GOERLI_SWAPS_TOKEN_OBJECT,
  SEPOLIA_SWAPS_TOKEN_OBJECT,
  ARBITRUM_SWAPS_TOKEN_OBJECT,
  OPTIMISM_SWAPS_TOKEN_OBJECT,
  ZKSYNC_ERA_SWAPS_TOKEN_OBJECT,
  LINEA_SWAPS_TOKEN_OBJECT,
  BASE_SWAPS_TOKEN_OBJECT,
  SWAPS_CHAINID_DEFAULT_TOKEN_MAP,
} from './constants/tokens';

export type { SwapsTokenObject } from './constants/tokens';

export { SWAPS_API_V2_BASE_URL } from './constants/swaps';

export { getEthUsdtResetData, isEthUsdt, getBridgeApiBaseUrl } from './utils';
