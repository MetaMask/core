/* eslint-disable @typescript-eslint/naming-convention */
import type { AccountsControllerGetAccountByAddressAction } from '@metamask/accounts-controller';
import type { AssetsControllerGetExchangeRatesForBridgeAction } from '@metamask/assets-controller';
import type {
  CurrencyRateControllerGetStateAction,
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
import type { SnapControllerHandleRequestAction } from '@metamask/snaps-controllers';
import type { Infer } from '@metamask/superstruct';
import type {
  CaipAccountId,
  CaipAssetId,
  CaipAssetType,
  CaipChainId,
  Hex,
} from '@metamask/utils';

import type { BridgeControllerMethodActions } from './bridge-controller-method-action-types.js';
import type { BridgeController } from './bridge-controller.js';
import type { BRIDGE_CONTROLLER_NAME } from './constants/bridge.js';
import type { SimulatedGasFeeLimitsSchema } from './validators/batch-sell.js';
import type { BatchSellTradesResponseSchema } from './validators/batch-sell.js';
import type { BridgeAssetSchema } from './validators/bridge-asset.js';
import type {
  ChainConfigurationSchema,
  ChainRankingSchema,
  PlatformConfigSchema,
} from './validators/feature-flags.js';
import type { IntentSchema } from './validators/intent.js';
import type { QuoteResponseV1 } from './validators/quote-response-v1.js';
import type { QuoteStreamCompleteSchema } from './validators/quote-stream-complete.js';
import type { TxFeeGasLimitsSchema } from './validators/quote.js';
import type { FeeDataSchema } from './validators/quote.js';
import type { GaslessPropertiesSchema } from './validators/quote.js';
import type { StepSchema } from './validators/step.js';
import type { TokenFeatureSchema } from './validators/token-feature.js';

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

/**
 * @deprecated Avoid introducing new usages and use the QuoteResponseV2 feeData.network value instead
 */
export type L1GasFees = {
  l1GasFeesInHexWei?: Hex; // l1 fees for approval and trade in hex wei, appended by BridgeController.#appendL1GasFees
};

/**
 * @deprecated Avoid introducing new usages and use the QuoteResponseV2 feeData.network value instead
 */
export type NonEvmFees = {
  nonEvmFeesInNative?: string; // Non-EVM chain fees in native units (SOL for Solana, BTC for Bitcoin)
};

export type InputPrimaryDenomination = 'token_amount' | 'fiat_value';

/**
 * Asset exchange rate values for a given chain and address
 */
export type ExchangeRate = { exchangeRate?: string; usdExchangeRate?: string };

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

export type Step = Infer<typeof StepSchema>;

export type RefuelData = Step;

export type FeeData = Infer<typeof FeeDataSchema>;

export type Intent = Infer<typeof IntentSchema>;
export type IntentOrderLike = Intent['order'];

export type BatchSellTradesRequest = {
  quotes: QuoteResponseV1[];
  stxEnabled: boolean;
};

/**
 * This is the bridge-api response for the obtainGaslessBatch method
 */
export type BatchSellTradesResponse = Infer<
  typeof BatchSellTradesResponseSchema
>;

export type SimulatedGasFeeLimits = Infer<typeof SimulatedGasFeeLimitsSchema>;
export type TxFeeGasLimits = Infer<typeof TxFeeGasLimitsSchema>;

export type GaslessProperties = Infer<typeof GaslessPropertiesSchema>;

type DeepPartialValue<Type> =
  NonNullable<Type> extends (infer U)[]
    ? DeepPartial<U>[]
    : NonNullable<Type> extends readonly (infer U)[]
      ? readonly DeepPartial<U>[]
      : NonNullable<Type> extends object
        ? DeepPartial<NonNullable<Type>>
        : Type;
export type DeepPartial<Type> = Type extends string
  ? Type
  : {
      [K in keyof Type]?: null extends Type[K]
        ? DeepPartialValue<Type[K]> | null
        : DeepPartialValue<Type[K]>;
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
  /** Internal bridge / token-list id for Stellar pubnet (Token API chain: stellar:pubnet). */
  STELLAR = 20000000000002,
  TRON = 728126428,
  SEI = 1329,
  MONAD = 143,
  HYPEREVM = 999,
  MEGAETH = 4326,
  ARC = 5042,
  ROBINHOOD = 4663,
}

export type FeatureFlagsPlatformConfig = Infer<typeof PlatformConfigSchema>;

export type TokenFeature = Infer<typeof TokenFeatureSchema>;

export type QuoteStreamCompleteData = Infer<typeof QuoteStreamCompleteSchema>;

export enum RequestStatus {
  LOADING = 0,
  FETCHED = 1,
  ERROR = 2,
}

export type BridgeControllerState = {
  quoteRequest: Partial<GenericQuoteRequest>[];
  quotes: (QuoteResponseV1 & L1GasFees & NonEvmFees)[];
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
  /**
   * Security alerts for the destination token in the current quote request,
   * populated from `token_warning` SSE events.
   */
  tokenWarnings: TokenFeature[];
  /**
   * Client-supplied security classification for the destination token in the
   * current quote request, used as the `token_security_type_destination`
   * analytics property. Set via the `context` arg of
   * `updateBridgeQuoteRequestParams` and reset whenever the quote request is
   * reset. `null` when the client has no security data for the token.
   */
  tokenSecurityTypeDestination: string | null;
  /**
   * The denomination currently shown as the primary source amount input.
   * This is persisted as a user preference so returning to the flow restores
   * the last selected fiat/token display mode.
   */
  inputPrimaryDenomination: InputPrimaryDenomination;
  /**
   * Metadata about the completed quote stream, populated from the `complete` SSE event.
   * Set to null at the start of each fetch and updated when the complete event is received.
   */
  quoteStreamComplete: QuoteStreamCompleteData | null;
  /**
   * Contains gasless transaction data and fees for BatchSell quotes, provided by the obtainGaslessBatch API
   */
  batchSellTrades: BatchSellTradesResponse | null;
  /**
   * The status of the batch sell trades fetch, including fee calculations and validations
   */
  batchSellTradesLoadingStatus: RequestStatus | null;
};

/**
 * @deprecated Use the separate method action types (e.g.,
 * `BridgeControllerFetchQuotesAction`) instead.
 */
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

export type BridgeControllerActions =
  | BridgeControllerGetStateAction
  | BridgeControllerMethodActions;

export type BridgeControllerEvents = BridgeControllerStateChangeEvent;

export type AllowedActions =
  | AccountsControllerGetAccountByAddressAction
  | AuthenticationControllerGetBearerTokenAction
  | CurrencyRateControllerGetStateAction
  | TokenRatesControllerGetStateAction
  | MultichainAssetsRatesControllerGetStateAction
  | SnapControllerHandleRequestAction
  | NetworkControllerFindNetworkClientIdByChainIdAction
  | NetworkControllerGetNetworkClientByIdAction
  | RemoteFeatureFlagControllerGetStateAction
  | AssetsControllerGetExchangeRatesForBridgeAction;
export type AllowedEvents = never;

/**
 * The messenger for the BridgeController.
 */
export type BridgeControllerMessenger = Messenger<
  typeof BRIDGE_CONTROLLER_NAME,
  BridgeControllerActions | AllowedActions,
  BridgeControllerEvents | AllowedEvents
>;
