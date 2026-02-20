import type { AccountsControllerGetAccountByAddressAction } from '@metamask/accounts-controller';
import type {
  GetCurrencyRateState,
  MultichainAssetsRatesControllerGetStateAction,
  TokenRatesControllerGetStateAction,
} from '@metamask/assets-controllers';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
} from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';
import type {
  NetworkControllerFindNetworkClientIdByChainIdAction,
  NetworkControllerGetNetworkClientByIdAction,
} from '@metamask/network-controller';
import type { AuthenticationControllerGetBearerTokenAction } from '@metamask/profile-sync-controller/auth';
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
  BitcoinTradeDataSchema,
  BridgeAssetSchema,
  ChainConfigurationSchema,
  ChainRankingSchema,
  FeatureId,
  FeeDataSchema,
  IntentSchema,
  PlatformConfigSchema,
  ProtocolSchema,
  QuoteResponseSchema,
  QuoteSchema,
  StepSchema,
  TronTradeDataSchema,
  TxDataSchema,
} from './utils/validators';

export type FetchFunction = (
  input: RequestInfo | URL | string,
  init?: RequestInit,
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

export type ChainRanking = Infer<typeof ChainRankingSchema>;

export type L1GasFees = {
  l1GasFeesInHexWei?: string; // l1 fees for approval and trade in hex wei, appended by BridgeController.#appendL1GasFees
};

export type NonEvmFees = {
  nonEvmFeesInNative?: string; // Non-EVM chain fees in native units (SOL for Solana, BTC for Bitcoin)
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
  /**
   * The fee that will be charged by MetaMask
   */
  fee?: number;
};

export enum StatusTypes {
  SUBMITTED = 'SUBMITTED',
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
  Hex | CaipAccountId | string // accountIds/addresses
>;

export type Protocol = Infer<typeof ProtocolSchema>;

export type Step = Infer<typeof StepSchema>;

export type RefuelData = Step;

export type FeeData = Infer<typeof FeeDataSchema>;

export type Quote = Infer<typeof QuoteSchema>;

export type TxData = Infer<typeof TxDataSchema>;

export type Intent = Infer<typeof IntentSchema>;
export type IntentOrderLike = Intent['order'];

export type BitcoinTradeData = Infer<typeof BitcoinTradeDataSchema>;

export type TronTradeData = Infer<typeof TronTradeDataSchema>;
/**
 * This is the type for the quote response from the bridge-api
 * TxDataType can be overriden to be a string when the quote is non-evm
 * ApprovalType can be overriden when you know the specific approval type (e.g., TxData for EVM-only contexts)
 */
export type QuoteResponse<
  TxDataType = TxData | string | BitcoinTradeData | TronTradeData,
  ApprovalType = TxData | TronTradeData,
> = Infer<typeof QuoteResponseSchema> & {
  trade: TxDataType;
  approval?: ApprovalType;
  /**
   * Appended to the quote response based on the quote request
   */
  featureId?: FeatureId;
  /**
   * Appended to the quote response based on the quote request resetApproval flag
   * If defined, the quote's total network fee will include the reset approval's gas limit.
   */
  resetApproval?: TxData;
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
  TRON = 728126428,
  SEI = 1329,
  MONAD = 143,
  HYPEREVM = 999,
  MEGAETH = 4326,
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
  TRACK_METAMETRICS_EVENT = 'trackUnifiedSwapBridgeEvent',
  STOP_POLLING_FOR_QUOTES = 'stopPollingForQuotes',
  FETCH_QUOTES = 'fetchQuotes',
}

export type BridgeControllerState = {
  quoteRequest: Partial<GenericQuoteRequest>;
  quotes: (QuoteResponse & L1GasFees & NonEvmFees)[];
  /**
   * The time elapsed between the initial quote fetch and when the first valid quote was received
   */
  quotesInitialLoadTime: number | null;
  /**
   * The timestamp of when the latest quote fetch started
   */
  quotesLastFetched: number | null;
  /**
   * The status of the quote fetch, including fee calculations and validations
   * This is set to
   * - LOADING when the quote fetch starts
   * - FETCHED when the process completes successfully, including when quotes are empty
   * - ERROR when any errors occur
   *
   * When SSE is enabled, this is set to LOADING even when a quote is available. It is only
   * set to FETCHED when the stream is closed and all quotes have been received
   */
  quotesLoadingStatus: RequestStatus | null;
  quoteFetchError: string | null;
  /**
   * The number of times the quotes have been refreshed, starts at 0 and is
   * incremented at the end of each quote fetch
   */
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

export type BridgeControllerGetStateAction = ControllerGetStateAction<
  typeof BRIDGE_CONTROLLER_NAME,
  BridgeControllerState
>;

export type BridgeControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof BRIDGE_CONTROLLER_NAME,
  BridgeControllerState
>;

// Maps to BridgeController function names
export type BridgeControllerActions =
  | BridgeControllerGetStateAction
  | BridgeControllerAction<BridgeBackgroundAction.SET_CHAIN_INTERVAL_LENGTH>
  | BridgeControllerAction<BridgeBackgroundAction.RESET_STATE>
  | BridgeControllerAction<BridgeBackgroundAction.TRACK_METAMETRICS_EVENT>
  | BridgeControllerAction<BridgeBackgroundAction.STOP_POLLING_FOR_QUOTES>
  | BridgeControllerAction<BridgeBackgroundAction.FETCH_QUOTES>
  | BridgeControllerAction<BridgeUserAction.UPDATE_QUOTE_PARAMS>;

export type BridgeControllerEvents = BridgeControllerStateChangeEvent;

export type AllowedActions =
  | AccountsControllerGetAccountByAddressAction
  | AuthenticationControllerGetBearerTokenAction
  | GetCurrencyRateState
  | TokenRatesControllerGetStateAction
  | MultichainAssetsRatesControllerGetStateAction
  | HandleSnapRequest
  | NetworkControllerFindNetworkClientIdByChainIdAction
  | NetworkControllerGetNetworkClientByIdAction
  | RemoteFeatureFlagControllerGetStateAction;
export type AllowedEvents = never;

/**
 * The messenger for the BridgeController.
 */
export type BridgeControllerMessenger = Messenger<
  typeof BRIDGE_CONTROLLER_NAME,
  BridgeControllerActions | AllowedActions,
  BridgeControllerEvents | AllowedEvents
>;
