import type { AccountsControllerGetSelectedMultichainAccountAction } from '@metamask/accounts-controller';
import type {
  ControllerStateChangeEvent,
  RestrictedMessenger,
} from '@metamask/base-controller';
import type {
  NetworkControllerFindNetworkClientIdByChainIdAction,
  NetworkControllerGetStateAction,
  NetworkControllerGetNetworkClientByIdAction,
} from '@metamask/network-controller';
import type { HandleSnapRequest } from '@metamask/snaps-controllers';
import type {
  CaipAccountId,
  CaipAssetId,
  CaipChainId,
  Hex,
} from '@metamask/utils';
import type { BigNumber } from 'bignumber.js';

import type { BridgeController } from './bridge-controller';
import type { BRIDGE_CONTROLLER_NAME } from './constants/bridge';

/**
 * Additional options accepted by the extension's fetchWithCache function
 */
type FetchWithCacheOptions = {
  cacheOptions?: {
    cacheRefreshTime: number;
  };
  functionName?: string;
};

export type FetchFunction = (
  input: RequestInfo | URL,
  init?: RequestInit & FetchWithCacheOptions,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) => Promise<any>;

/**
 * The types of assets that a user can send
 */
export enum AssetType {
  /** The native asset for the current network, such as ETH */
  native = 'NATIVE',
  /** An ERC20 token */
  token = 'TOKEN',
  /** An ERC721 or ERC1155 token. */
  NFT = 'NFT',
  /**
   * A transaction interacting with a contract that isn't a token method
   * interaction will be marked as dealing with an unknown asset type.
   */
  unknown = 'UNKNOWN',
}

export type ChainConfiguration = {
  isActiveSrc: boolean;
  isActiveDest: boolean;
  refreshRate?: number;
  topAssets?: string[];
};

export type L1GasFees = {
  l1GasFeesInHexWei?: string; // l1 fees for approval and trade in hex wei, appended by BridgeController.#appendL1GasFees
};

export type SolanaFees = {
  solanaFeesInLamports?: string; // solana fees in lamports, appended by BridgeController.#appendSolanaFees
};

/**
 * valueInCurrency values are calculated based on the user's selected currency
 */
export type TokenAmountValues = {
  amount: BigNumber;
  valueInCurrency: BigNumber | null;
  usd: BigNumber | null;
};

/**
 * Values derived from the quote response
 */
export type QuoteMetadata = {
  gasFee: TokenAmountValues;
  totalNetworkFee: TokenAmountValues; // estimatedGasFees + relayerFees
  totalMaxNetworkFee: TokenAmountValues; // maxGasFees + relayerFees
  toTokenAmount: TokenAmountValues;
  adjustedReturn: Omit<TokenAmountValues, 'amount'>; // destTokenAmount - totalNetworkFee
  sentAmount: TokenAmountValues; // srcTokenAmount + metabridgeFee
  swapRate: BigNumber; // destTokenAmount / sentAmount
  cost: Omit<TokenAmountValues, 'amount'>; // sentAmount - adjustedReturn
};

/**
 * Sort order set by the user
 */
export enum SortOrder {
  COST_ASC = 'cost_ascending',
  ETA_ASC = 'time_descending',
}

/**
 * This is the interface for the asset object returned by the bridge-api
 * This type is used in the QuoteResponse and in the fetchBridgeTokens response
 */
export type BridgeAsset = {
  /**
   * The chainId of the token
   */
  chainId: ChainId;
  /**
   * An address that the metaswap-api recognizes as the default token
   */
  address: string;
  /**
   * The symbol of token object
   */
  symbol: string;
  /**
   * The name for the network
   */
  name: string;
  /**
   * Number of digits after decimal point
   */
  decimals: number;
  icon?: string;
  /**
   * URL for token icon
   */
  iconUrl?: string;
  /**
   * The assetId of the token
   */
  assetId: string;
};

/**
 * This is the interface for the token object used in the extension client
 * In addition to the {@link BridgeAsset} fields, it includes balance information
 */
export type BridgeToken = {
  address: string;
  symbol: string;
  image: string;
  decimals: number;
  chainId: number | Hex | ChainId | CaipChainId;
  balance: string; // raw balance
  // TODO deprecate this field and use balance instead
  string: string | undefined; // normalized balance as a stringified number
  tokenFiatAmount?: number | null;
};

export enum BridgeFlag {
  EXTENSION_CONFIG = 'extension-config',
  MOBILE_CONFIG = 'mobile-config',
}
type DecimalChainId = string;
export type GasMultiplierByChainId = Record<DecimalChainId, number>;

type FeatureFlagResponsePlatformConfig = {
  refreshRate: number;
  maxRefreshCount: number;
  support: boolean;
  chains: Record<string, ChainConfiguration>;
};

export type FeatureFlagResponse = {
  [BridgeFlag.EXTENSION_CONFIG]: FeatureFlagResponsePlatformConfig;
  [BridgeFlag.MOBILE_CONFIG]: FeatureFlagResponsePlatformConfig;
};

/**
 * This is the interface for the quote request sent to the bridge-api
 * and should only be used by the fetchBridgeQuotes utility function
 * Components and redux stores should use the {@link GenericQuoteRequest} type
 */
export type QuoteRequest<
  ChainIdType = ChainId | number,
  TokenAddressType = string,
  WalletAddressType = string,
> = {
  walletAddress: WalletAddressType;
  destWalletAddress?: WalletAddressType;
  srcChainId: ChainIdType;
  destChainId: ChainIdType;
  srcTokenAddress: TokenAddressType;
  destTokenAddress: TokenAddressType;
  /**
   * This is the amount sent, in atomic amount
   */
  srcTokenAmount: string;
  slippage?: number;
  aggIds?: string[];
  bridgeIds?: string[];
  insufficientBal?: boolean;
  resetApproval?: boolean;
  refuel?: boolean;
};

/**
 * These are types that components pass in. Since data is a mix of types when coming from the redux store, we need to use a generic type that can cover all the types.
 * Payloads with this type are transformed into QuoteRequest by fetchBridgeQuotes right before fetching quotes
 */
export type GenericQuoteRequest = QuoteRequest<
  Hex | CaipChainId | string | number, // chainIds
  Hex | CaipAssetId | string, // assetIds/addresses
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-arguments
  Hex | CaipAccountId | string // accountIds/addresses
>;

export type Protocol = {
  name: string;
  displayName?: string;
  icon?: string;
};

export enum ActionTypes {
  BRIDGE = 'bridge',
  SWAP = 'swap',
  REFUEL = 'refuel',
}

export type Step = {
  action: ActionTypes;
  srcChainId: ChainId;
  destChainId?: ChainId;
  srcAsset: BridgeAsset;
  destAsset: BridgeAsset;
  srcAmount: string;
  destAmount: string;
  protocol: Protocol;
};

export type RefuelData = Step;

export type Quote = {
  requestId: string;
  srcChainId: ChainId;
  srcAsset: BridgeAsset;
  // Some tokens have a fee of 0, so sometimes it's equal to amount sent
  srcTokenAmount: string; // Atomic amount, the amount sent - fees
  destChainId: ChainId;
  destAsset: BridgeAsset;
  destTokenAmount: string; // Atomic amount, the amount received
  feeData: Record<FeeType.METABRIDGE, FeeData> &
    Partial<Record<FeeType, FeeData>>;
  bridgeId: string;
  bridges: string[];
  steps: Step[];
  refuel?: RefuelData;
};

export type QuoteResponse = {
  quote: Quote;
  approval?: TxData | null;
  trade: TxData;
  estimatedProcessingTimeInSeconds: number;
};

export enum ChainId {
  ETH = 1,
  OPTIMISM = 10,
  BSC = 56,
  POLYGON = 137,
  ZKSYNC = 324,
  BASE = 8453,
  ARBITRUM = 42161,
  AVALANCHE = 43114,
  LINEA = 59144,
  SOLANA = 1151111081099710,
}

export enum FeeType {
  METABRIDGE = 'metabridge',
  REFUEL = 'refuel',
}
export type FeeData = {
  amount: string;
  asset: BridgeAsset;
};
export type TxData = {
  chainId: ChainId;
  to: string;
  from: string;
  value: string;
  data: string;
  gasLimit: number | null;
};
export enum BridgeFeatureFlagsKey {
  EXTENSION_CONFIG = 'extensionConfig',
  MOBILE_CONFIG = 'mobileConfig',
}

type FeatureFlagsPlatformConfig = {
  refreshRate: number;
  maxRefreshCount: number;
  support: boolean;
  chains: Record<CaipChainId, ChainConfiguration>;
};

export type BridgeFeatureFlags = {
  [BridgeFeatureFlagsKey.EXTENSION_CONFIG]: FeatureFlagsPlatformConfig;
  [BridgeFeatureFlagsKey.MOBILE_CONFIG]: FeatureFlagsPlatformConfig;
};
export enum RequestStatus {
  LOADING,
  FETCHED,
  ERROR,
}
export enum BridgeUserAction {
  SELECT_DEST_NETWORK = 'selectDestNetwork',
  UPDATE_QUOTE_PARAMS = 'updateBridgeQuoteRequestParams',
}
export enum BridgeBackgroundAction {
  SET_FEATURE_FLAGS = 'setBridgeFeatureFlags',
  RESET_STATE = 'resetState',
  GET_BRIDGE_ERC20_ALLOWANCE = 'getBridgeERC20Allowance',
}

export type BridgeControllerState = {
  bridgeFeatureFlags: BridgeFeatureFlags;
  quoteRequest: Partial<GenericQuoteRequest>;
  quotes: (QuoteResponse & L1GasFees & SolanaFees)[];
  quotesInitialLoadTime: number | null;
  quotesLastFetched: number | null;
  quotesLoadingStatus: RequestStatus | null;
  quoteFetchError: string | null;
  quotesRefreshCount: number;
};

export type BridgeControllerAction<
  FunctionName extends keyof BridgeController,
> = {
  type: `${typeof BRIDGE_CONTROLLER_NAME}:${FunctionName}`;
  handler: BridgeController[FunctionName];
};

// Maps to BridgeController function names
export type BridgeControllerActions =
  | BridgeControllerAction<BridgeBackgroundAction.SET_FEATURE_FLAGS>
  | BridgeControllerAction<BridgeBackgroundAction.RESET_STATE>
  | BridgeControllerAction<BridgeBackgroundAction.GET_BRIDGE_ERC20_ALLOWANCE>
  | BridgeControllerAction<BridgeUserAction.UPDATE_QUOTE_PARAMS>;

export type BridgeControllerEvents = ControllerStateChangeEvent<
  typeof BRIDGE_CONTROLLER_NAME,
  BridgeControllerState
>;

export type AllowedActions =
  | AccountsControllerGetSelectedMultichainAccountAction
  | HandleSnapRequest
  | NetworkControllerFindNetworkClientIdByChainIdAction
  | NetworkControllerGetStateAction
  | NetworkControllerGetNetworkClientByIdAction;
export type AllowedEvents = never;

/**
 * The messenger for the BridgeController.
 */
export type BridgeControllerMessenger = RestrictedMessenger<
  typeof BRIDGE_CONTROLLER_NAME,
  BridgeControllerActions | AllowedActions,
  BridgeControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;
