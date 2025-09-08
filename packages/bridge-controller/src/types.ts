import type { AccountsControllerGetSelectedMultichainAccountAction } from '@metamask/accounts-controller';
import type {
  GetCurrencyRateState,
  MultichainAssetsRatesControllerGetStateAction,
  TokenRatesControllerGetStateAction,
} from '@metamask/assets-controllers';
import type {
  ControllerStateChangeEvent,
  RestrictedMessenger,
} from '@metamask/base-controller';
import type {
  NetworkControllerFindNetworkClientIdByChainIdAction,
  NetworkControllerGetStateAction,
  NetworkControllerGetNetworkClientByIdAction,
} from '@metamask/network-controller';
import type { RemoteFeatureFlagControllerGetStateAction } from '@metamask/remote-feature-flag-controller';
import type { HandleSnapRequest } from '@metamask/snaps-controllers';
import type { Infer } from '@metamask/superstruct';
import type {
  CaipAccountId,
  CaipAssetId,
  CaipAssetType,
  CaipChainId,
  Hex,
} from '@metamask/utils';

import type { BridgeController } from './bridge-controller';
import type { BRIDGE_CONTROLLER_NAME } from './constants/bridge';
import type {
  BridgeAssetSchema,
  ChainConfigurationSchema,
  FeeDataSchema,
  IntentSchema,
  PlatformConfigSchema,
  ProtocolSchema,
  QuoteResponseSchema,
  QuoteSchema,
  StepSchema,
  TxDataSchema,
} from './utils/validators';

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

export type ChainConfiguration = Infer<typeof ChainConfigurationSchema>;

export type L1GasFees = {
  l1GasFeesInHexWei?: string; // l1 fees for approval and trade in hex wei, appended by BridgeController.#appendL1GasFees
};

export type SolanaFees = {
  solanaFeesInLamports?: string; // solana fees in lamports, appended by BridgeController.#appendSolanaFees
};

/**
 * The types of values for the token amount and its values when converted to the user's selected currency and USD
 */
export type TokenAmountValues = {
  /**
   * The amount of the token
   *
   * @example "1000000000000000000"
   */
  amount: string;
  /**
   * The amount of the token in the user's selected currency
   *
   * @example "4.55"
   */
  valueInCurrency: string | null;
  /**
   * The amount of the token in USD
   *
   * @example "1.234"
   */
  usd: string | null;
};

/**
 * Asset exchange rate values for a given chain and address
 */
export type ExchangeRate = { exchangeRate?: string; usdExchangeRate?: string };

/**
 * Values derived from the quote response
 */
export type QuoteMetadata = {
  /**
   * If gas is included, this is the value of the src or dest token that was used to pay for the gas
   */
  includedTxFees?: TokenAmountValues | null;
  /**
   * The gas fee for the bridge transaction.
   * effective is the gas fee that is shown to the user. If this value is not
   * included in the trade, the calculation falls back to the gasLimit (total)
   * total is the gas fee that is spent by the user, including refunds.
   * max is the max gas fee that will be used by the transaction.
   */
  gasFee: Record<'effective' | 'total' | 'max', TokenAmountValues>;
  totalNetworkFee: TokenAmountValues; // estimatedGasFees + relayerFees
  totalMaxNetworkFee: TokenAmountValues; // maxGasFees + relayerFees
  /**
   * The amount that the user will receive (destTokenAmount)
   */
  toTokenAmount: TokenAmountValues;
  /**
   * The minimum amount that the user will receive (minDestTokenAmount)
   */
  minToTokenAmount: TokenAmountValues;
  /**
   * If gas is included: toTokenAmount
   * Otherwise: toTokenAmount - totalNetworkFee
   */
  adjustedReturn: Omit<TokenAmountValues, 'amount'>;
  /**
   * The amount that the user will send, including fees
   * srcTokenAmount + metabridgeFee + txFee
   */
  sentAmount: TokenAmountValues;
  swapRate: string; // destTokenAmount / sentAmount
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
export type BridgeAsset = Infer<typeof BridgeAssetSchema>;

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
  occurrences?: number;
};

type DecimalChainId = string;
export type GasMultiplierByChainId = Record<DecimalChainId, number>;

export type FeatureFlagResponse = Infer<typeof PlatformConfigSchema>;

// TODO move definition to validators.ts
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
  /**
   * Whether the response should include gasless swap quotes
   * This should be true if the user has opted in to STX on the client
   * and the current network has STX support
   */
  gasIncluded: boolean;
  /**
   * Whether to request quotes that use EIP-7702 delegated gasless execution
   */
  gasIncluded7702: boolean;
  noFee?: boolean;
};

export enum StatusTypes {
  UNKNOWN = 'UNKNOWN',
  FAILED = 'FAILED',
  PENDING = 'PENDING',
  COMPLETE = 'COMPLETE',
}

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

export type Protocol = Infer<typeof ProtocolSchema>;

export type Step = Infer<typeof StepSchema>;

export type RefuelData = Step;

export type FeeData = Infer<typeof FeeDataSchema>;

export type Quote = Infer<typeof QuoteSchema>;

export type TxData = Infer<typeof TxDataSchema>;
export type Intent = Infer<typeof IntentSchema>;
export type CowSwapOrderLike = Intent['order'];
/**
 * This is the type for the quote response from the bridge-api
 * TxDataType can be overriden to be a string when the quote is non-evm
 */
export type QuoteResponse<TxDataType = TxData> = Infer<
  typeof QuoteResponseSchema
> & {
  trade: TxDataType;
  approval?: TxData;
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
  BTC = 20000000000001,
}

export type FeatureFlagsPlatformConfig = Infer<typeof PlatformConfigSchema>;

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
  SET_CHAIN_INTERVAL_LENGTH = 'setChainIntervalLength',
  RESET_STATE = 'resetState',
  GET_BRIDGE_ERC20_ALLOWANCE = 'getBridgeERC20Allowance',
  TRACK_METAMETRICS_EVENT = 'trackUnifiedSwapBridgeEvent',
  STOP_POLLING_FOR_QUOTES = 'stopPollingForQuotes',
  FETCH_QUOTES = 'fetchQuotes',
}

export type BridgeControllerState = {
  quoteRequest: Partial<GenericQuoteRequest>;
  quotes: (QuoteResponse & L1GasFees & SolanaFees)[];
  quotesInitialLoadTime: number | null;
  quotesLastFetched: number | null;
  quotesLoadingStatus: RequestStatus | null;
  quoteFetchError: string | null;
  quotesRefreshCount: number;
  /**
   * Asset exchange rates for EVM and multichain assets that are not indexed by the assets controllers
   */
  assetExchangeRates: Record<CaipAssetType, ExchangeRate>;
  /**
   * When the src token is SOL, this needs to be subtracted from their balance to determine
   * the max amount that can be sent.
   */
  minimumBalanceForRentExemptionInLamports: string | null;
};

export type BridgeControllerAction<
  FunctionName extends keyof BridgeController,
> = {
  type: `${typeof BRIDGE_CONTROLLER_NAME}:${FunctionName}`;
  handler: BridgeController[FunctionName];
};

// Maps to BridgeController function names
export type BridgeControllerActions =
  | BridgeControllerAction<BridgeBackgroundAction.SET_CHAIN_INTERVAL_LENGTH>
  | BridgeControllerAction<BridgeBackgroundAction.RESET_STATE>
  | BridgeControllerAction<BridgeBackgroundAction.GET_BRIDGE_ERC20_ALLOWANCE>
  | BridgeControllerAction<BridgeBackgroundAction.TRACK_METAMETRICS_EVENT>
  | BridgeControllerAction<BridgeBackgroundAction.STOP_POLLING_FOR_QUOTES>
  | BridgeControllerAction<BridgeBackgroundAction.FETCH_QUOTES>
  | BridgeControllerAction<BridgeUserAction.UPDATE_QUOTE_PARAMS>;

export type BridgeControllerEvents = ControllerStateChangeEvent<
  typeof BRIDGE_CONTROLLER_NAME,
  BridgeControllerState
>;

export type AllowedActions =
  | AccountsControllerGetSelectedMultichainAccountAction
  | GetCurrencyRateState
  | TokenRatesControllerGetStateAction
  | MultichainAssetsRatesControllerGetStateAction
  | HandleSnapRequest
  | NetworkControllerFindNetworkClientIdByChainIdAction
  | NetworkControllerGetStateAction
  | NetworkControllerGetNetworkClientByIdAction
  | RemoteFeatureFlagControllerGetStateAction;
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
