import type {
  AssetsControllerGetStateForTransactionPayAction,
  AssetsControllerStateChangeEvent,
} from '@metamask/assets-controller';
import type {
  CurrencyRateControllerGetStateAction,
  CurrencyRateStateChange,
  TokenBalancesControllerGetStateAction,
} from '@metamask/assets-controllers';
import type { TokenRatesControllerGetStateAction } from '@metamask/assets-controllers';
import type { TokenRatesControllerStateChangeEvent } from '@metamask/assets-controllers';
import type {
  TokensControllerGetStateAction,
  TokensControllerStateChangeEvent,
} from '@metamask/assets-controllers';
import type { AccountTrackerControllerGetStateAction } from '@metamask/assets-controllers';
import type { ControllerStateChangeEvent } from '@metamask/base-controller';
import type { ControllerGetStateAction } from '@metamask/base-controller';
import type { GetGasFeeState } from '@metamask/gas-fee-controller';
import type {
  KeyringControllerGetStateAction,
  KeyringControllerSignTypedMessageAction,
  KeyringControllerUnlockEvent,
  KeyringTypes,
} from '@metamask/keyring-controller';
import type { Messenger } from '@metamask/messenger';
import type { NetworkControllerFindNetworkClientIdByChainIdAction } from '@metamask/network-controller';
import type { NetworkControllerGetNetworkClientByIdAction } from '@metamask/network-controller';
import type { NetworkControllerGetNetworkConfigurationByChainIdAction } from '@metamask/network-controller';
import type { Quote as RampsQuote } from '@metamask/ramps-controller';
import type {
  RampsControllerGetOrderAction,
  RampsControllerGetQuotesAction,
} from '@metamask/ramps-controller';
import type { RemoteFeatureFlagControllerGetStateAction } from '@metamask/remote-feature-flag-controller';
import type {
  AtomicBatchPreparationResult,
  AuthorizationList,
  NestedTransactionUpdate,
  RequiredAsset,
  TransactionControllerAddTransactionBatchAction,
  TransactionControllerBeginAtomicBatchUpdateAction,
  TransactionControllerEstimateGasAction,
  TransactionControllerEstimateGasBatchAction,
  TransactionControllerUnapprovedTransactionAddedEvent,
} from '@metamask/transaction-controller';
import type {
  BatchTransaction,
  BatchTransactionParams,
  TransactionControllerAddTransactionAction,
  TransactionControllerGetGasFeeTokensAction,
  TransactionControllerGetStateAction,
  TransactionControllerStateChangeEvent,
  TransactionControllerUpdateTransactionAction,
  TransactionMeta,
} from '@metamask/transaction-controller';
import type { Hex, Json } from '@metamask/utils';
import type { Draft } from 'immer';

import type {
  CONTROLLER_NAME,
  PaymentOverride,
  TransactionPayStrategy,
} from './constants';
import type { TransactionPayControllerMethodActions } from './TransactionPayController-method-action-types';

export type AllowedActions =
  | AccountTrackerControllerGetStateAction
  | AssetsControllerGetStateForTransactionPayAction
  | CurrencyRateControllerGetStateAction
  | GetGasFeeState
  | KeyringControllerGetStateAction
  | KeyringControllerSignTypedMessageAction
  | NetworkControllerFindNetworkClientIdByChainIdAction
  | NetworkControllerGetNetworkClientByIdAction
  | NetworkControllerGetNetworkConfigurationByChainIdAction
  | RampsControllerGetOrderAction
  | RampsControllerGetQuotesAction
  | RemoteFeatureFlagControllerGetStateAction
  | TokenBalancesControllerGetStateAction
  | TokenRatesControllerGetStateAction
  | TokensControllerGetStateAction
  | TransactionControllerAddTransactionAction
  | TransactionControllerAddTransactionBatchAction
  | TransactionControllerBeginAtomicBatchUpdateAction
  | TransactionControllerEstimateGasAction
  | TransactionControllerEstimateGasBatchAction
  | TransactionControllerGetGasFeeTokensAction
  | TransactionControllerGetStateAction
  | TransactionControllerUpdateTransactionAction;

export type AllowedEvents =
  | AssetsControllerStateChangeEvent
  | CurrencyRateStateChange
  | KeyringControllerUnlockEvent
  | TokenRatesControllerStateChangeEvent
  | TokensControllerStateChangeEvent
  | TransactionControllerStateChangeEvent
  | TransactionControllerUnapprovedTransactionAddedEvent;

export type TransactionPayControllerGetStateAction = ControllerGetStateAction<
  typeof CONTROLLER_NAME,
  TransactionPayControllerState
>;

/** Configurable properties of a transaction. */
export type TransactionConfig = {
  /**
   * Optional address to override the default account used by the transaction.
   * When `isPostQuote` is true, used as the recipient of the MM Pay transfer.
   * When `isPostQuote` is false, it provides the funds and pays for gas.
   */
  accountOverride?: Hex;

  /**
   * Whether the source of funds is HyperLiquid (HyperCore).
   * When true, the Relay strategy uses the HyperLiquid 2-step withdrawal
   * flow: (1) authorize nonce-mapping, (2) sendAsset to Relay solver.
   */
  isHyperliquidSource?: boolean;

  /** Whether the source of funds is a Polymarket deposit wallet. */
  isPolymarketDepositWallet?: boolean;

  /** Whether the user has selected the maximum amount. */
  isMaxAmount?: boolean;

  /**
   * Whether this is a post-quote transaction.
   * When true, the paymentToken represents the destination token,
   * and the quote source is derived from the transaction's output token.
   */
  isPostQuote?: boolean;

  /** Overrides the payment source for the transaction. */
  paymentOverride?: PaymentOverride;

  /** When true, a quote is always fetched even when the source and target tokens are identical. */
  isQuoteRequired?: boolean;

  /**
   * Optional address to receive refunds if the quote provider transaction fails.
   * When set, overrides the default refund recipient (EOA) in the quote
   * request. Use this for post-quote flows where the user's funds originate
   * from a smart contract account (e.g. Predict Safe proxy) so that refunds
   * go back to that account rather than the EOA.
   */
  refundTo?: Hex;
};

/** Callback to update transaction config. */
export type TransactionConfigCallback = (config: TransactionConfig) => void;

/** Request passed to {@link GetPaymentOverrideDataCallback}. */
export type GetPaymentOverrideDataRequest = {
  /** Amount of the source token in human-readable format. */
  amount: string;

  /** Metadata of the original transaction. */
  transaction: TransactionMeta;

  /** Pay-controller state for the transaction. */
  transactionData: TransactionData;
};

/** Response returned by {@link GetPaymentOverrideDataCallback}. */
export type GetPaymentOverrideDataResponse = {
  /** Batch transaction params to prepend to the submit batch. */
  calls: BatchTransactionParams[];

  /** Optional recipient address for the funding token transfer. */
  recipient?: Hex;

  /** Optional EIP-7702 authorization list from delegation. */
  authorizationList?: AuthorizationList;
};

/**
 * Callback invoked during submit when `paymentOverride` is defined.
 * Returns batch transaction params to prepend to the submit batch.
 */
export type GetPaymentOverrideDataCallback = (
  request: GetPaymentOverrideDataRequest,
) => Promise<GetPaymentOverrideDataResponse>;

export type GetAmountDataRequest = {
  /** Raw token amount (atomic units) to encode into calldata. */
  amount: string;

  /** Metadata of the transaction whose nested calls need updating. */
  transaction: TransactionMeta;
};

export type GetAmountDataResponse = {
  /** Per-nested-call data updates; empty when no update is needed. */
  updates: { nestedTransactionIndex: number; data: Hex }[];
};

/**
 * Optional callback that re-encodes nested transaction calldata for a given
 * token amount. Used by transaction types with non-standard nested data
 * (e.g. vault approve + deposit) that cannot be derived from the amount alone
 * without client-side context (vault config, RPC providers, etc.).
 */
export type GetAmountDataCallback = (
  request: GetAmountDataRequest,
) => Promise<GetAmountDataResponse>;

/** Request passed to the explicit amount preparation callback. */
export type PrepareTransactionAmountRequest = {
  /** Exact human-readable decimal amount selected by the caller. */
  amountHuman: string;

  /** Signal aborted when a different amount intent supersedes this request. */
  signal: AbortSignal;

  /** Coherent transaction snapshot to prepare. */
  transaction: TransactionMeta;
};

/** Result returned by the explicit amount preparation callback. */
export type PrepareTransactionAmountResult =
  | {
      /** Indicates that this transaction adopts explicit amount preparation. */
      kind: 'prepared';

      /** Raw atomic-unit amount corresponding to `amountHuman`. */
      amountRaw: string;

      /** Complete assets required by the prepared transaction. */
      requiredAssets: RequiredAsset[];

      /** Complete nested calldata patch. */
      nestedTransactionUpdates: NestedTransactionUpdate[];

      /** Exact indexes that must be present in the nested calldata patch. */
      requiredNestedTransactionIndexes: number[];
    }
  | {
      /** Indicates that explicit amount preparation does not apply. */
      kind: 'not-applicable';
    };

/** Callback that prepares a complete transaction patch for an exact amount. */
export type PrepareTransactionAmountCallback = (
  request: PrepareTransactionAmountRequest,
) => Promise<PrepareTransactionAmountResult>;

/** Request to explicitly update a transaction amount. */
export type UpdateAmountRequest = {
  /** Exact human-readable decimal amount selected by the caller. */
  amountHuman: string;

  /** ID of the transaction to update. */
  transactionId: string;
};

/** Callback to update fiat payment state. */
export type TransactionFiatPaymentCallback = (
  fiatPayment: TransactionFiatPayment,
) => void;

export type TransactionPayControllerStateChangeEvent =
  ControllerStateChangeEvent<
    typeof CONTROLLER_NAME,
    TransactionPayControllerState
  >;

export type TransactionPayControllerActions =
  | TransactionPayControllerGetStateAction
  | TransactionPayControllerMethodActions;

export type TransactionPayControllerEvents =
  TransactionPayControllerStateChangeEvent;

export type TransactionPayControllerMessenger = Messenger<
  typeof CONTROLLER_NAME,
  TransactionPayControllerActions | AllowedActions,
  TransactionPayControllerEvents | AllowedEvents
>;

/**
 * Keyring types that support EIP-7702 authorization signing.
 * Hardware wallets, snap keyrings, and custody keyrings are excluded.
 */
export const KEYRING_TYPES_SUPPORTING_7702: `${KeyringTypes}`[] = [
  'HD Key Tree',
  'Simple Key Pair',
  'Money Keyring',
];

/** Options for the TransactionPayController. */
export type TransactionPayControllerOptions = {
  /** Optional callback to re-encode nested transaction calldata for a given amount. */
  getAmountData?: GetAmountDataCallback;

  /** Optional callback used by the explicit amount update proof of concept. */
  prepareTransactionAmount?: PrepareTransactionAmountCallback;

  /** Callback to convert a transaction into a redeem delegation. */
  getDelegationTransaction: GetDelegationTransactionCallback;

  /** Optional fiat execution configuration. */
  fiatOptions?: TransactionPayFiatOptions;

  /**
   * Optional callback invoked during quote execution when `paymentOverride` is defined.
   * Returns additional transactions to be submitted alongside the quote batch.
   */
  getPaymentOverrideData?: GetPaymentOverrideDataCallback;

  /** Callback to select the PayStrategy for a transaction. */
  getStrategy?: (transaction: TransactionMeta) => TransactionPayStrategy;

  /** Callback to select ordered PayStrategies for a transaction. */
  getStrategies?: (transaction: TransactionMeta) => TransactionPayStrategy[];

  /** Controller messenger. */
  messenger: TransactionPayControllerMessenger;

  /** Callbacks for the Polymarket relayer; required only for the Polymarket deposit-wallet flow. */
  polymarket?: PolymarketCallbacks;

  /** Initial state of the controller. */
  state?: Partial<TransactionPayControllerState>;
};

/** State of the TransactionPayController. */
export type TransactionPayControllerState = {
  /** State relating to each transaction, keyed by transaction ID. */
  transactionData: Record<string, TransactionData>;
};

/** Optional fiat execution configuration. */
export type TransactionPayFiatOptions = {
  /** Test funding source used to bypass fiat on-ramp execution during local QA. */
  testFundingSource?: Hex;

  /** Optional human amount to transfer from the test funding source. */
  testAmountOverride?: string;
};

/** State relating to a single transaction. */
export type TransactionData = {
  /**
   * Optional address to override the default account used by the transaction.
   * When `isPostQuote` is true, used as the recipient of the MM Pay transfer.
   * When `isPostQuote` is false, it provides the funds and pays for gas.
   */
  accountOverride?: Hex;

  /** Fiat payment method state. */
  fiatPayment?: TransactionFiatPayment;

  /** Whether quotes are currently being retrieved. */
  isLoading: boolean;

  /** Whether the user has selected the maximum amount. */
  isMaxAmount?: boolean;

  /**
   * Whether this is a post-quote transaction.
   * When true, the paymentToken represents the destination token,
   * and the quote source is derived from the transaction's output token.
   * Used when funds need to be moved after a transaction completes
   * (e.g., bridging output to a different token/chain).
   */
  isPostQuote?: boolean;

  /** Whether the source of funds is HyperLiquid (HyperCore). */
  isHyperliquidSource?: boolean;

  /** Whether the source of funds is a Polymarket deposit wallet. */
  isPolymarketDepositWallet?: boolean;

  /** Overrides the payment source for the transaction. */
  paymentOverride?: PaymentOverride;

  /** When true, a quote is always fetched even when the source and target tokens are identical. */
  isQuoteRequired?: boolean;

  /**
   * Optional address to receive refunds if the quote provider transaction fails.
   * When set, overrides the default refund recipient (EOA) in the quote
   * request.
   */
  refundTo?: Hex;

  /**
   * Token selected for the transaction.
   * - For standard flows (isPostQuote=false): This is the SOURCE/payment token
   * - For post-quote flows (isPostQuote=true): This is the DESTINATION token
   */
  paymentToken?: TransactionPaymentToken;

  /** Quotes retrieved for the transaction. */
  quotes?: TransactionPayQuote<Json>[];

  /** Timestamp of when quotes were last updated. */
  quotesLastUpdated?: number;

  /** Amounts of payment token required for each required token. */
  sourceAmounts?: TransactionPaySourceAmount[];

  /** Tokens required by the transaction. */
  tokens: TransactionPayRequiredToken[];

  /** Calculated totals for the transaction. */
  totals?: TransactionPayTotals;
};

/** Fiat payment state stored per transaction. */
export type TransactionFiatPayment = {
  /** Entered fiat amount for the selected payment method. */
  amountFiat?: string;

  /** CAIP-19 asset id derived from the transaction type for the fiat on-ramp. */
  caipAssetId?: string;

  /** Order identifier in normalized format (/providers/{provider}/orders/{id}). */
  orderId?: string;

  /** The ramps quote received from the ramps provider. */
  rampsQuote?: RampsQuote;

  /** Selected fiat payment method ID. */
  selectedPaymentMethodId?: string;
};

/** A token required by a transaction. */
export type TransactionPayRequiredToken = {
  /** Address of the required token. */
  address: Hex;

  /** Whether to allow quotes that return less than the minimum amount requested. */
  allowUnderMinimum: boolean;

  /** Amount required in the selected currency. */
  amountFiat: string;

  /** Amount required in a human-readable format factoring token decimals. */
  amountHuman: string;

  /** Amount required in atomic format without factoring token decimals. */
  amountRaw: string;

  /** Amount required in USD. */
  amountUsd: string;

  /** Balance of the required token in the selected currency. */
  balanceFiat: string;

  /** Balance of the required token in a human-readable format factoring token decimals. */
  balanceHuman: string;

  /** Balance of the required token in atomic format without factoring token decimals. */
  balanceRaw: string;

  /** Balance of the required token in USD. */
  balanceUsd: string;

  /** Chain ID of the required token. */
  chainId: Hex;

  /** Decimals of the required token. */
  decimals: number;

  /** Whether to skip transfer of this token if balance is already sufficient. */
  skipIfBalance: boolean;

  /** Symbol of the required token. */
  symbol: string;
};

/** Amount of payment token required by a required token. */
export type TransactionPaySourceAmount = {
  /** Amount of payment token required in the selected currency. */
  sourceAmountHuman: string;

  /** Amount of payment token required in atomic format without factoring token decimals. */
  sourceAmountRaw: string;

  /** Balance of the source token in atomic format (for post-quote flows). */
  sourceBalanceRaw?: string;

  /** Chain ID of the source token (for post-quote flows). */
  sourceChainId?: Hex;

  /** Address of the source token (for post-quote flows). */
  sourceTokenAddress?: Hex;

  /** Address of the target token. */
  targetTokenAddress: Hex;
};

/** Source token used to pay for required tokens. */
export type TransactionPaymentToken = {
  /** Address of the payment token. */
  address: Hex;

  /** Balance of the payment token in the selected currency. */
  balanceFiat: string;

  /** Balance of the payment token in a human-readable format factoring token decimals. */
  balanceHuman: string;

  /** Balance of the payment token in atomic format without factoring token decimals. */
  balanceRaw: string;

  /** Balance of the payment token in USD. */
  balanceUsd: string;

  /** Chain ID of the payment token. */
  chainId: Hex;

  /** Decimals of the payment token. */
  decimals: number;

  /** Symbol of the payment token. */
  symbol: string;
};

/** Callback to update state for a single transaction. */
export type UpdateTransactionDataCallback = (
  /** ID of the transaction to update. */
  transactionId: string,
  /** Function that receives a draft of the transaction data to update. */
  fn: (data: Draft<TransactionData>) => void,
) => void;

/** Conversion rates from the native currency to other currencies. */
export type FiatRates = {
  /** Conversion rate for the native currency to the selected fiat currency. */
  fiatRate: string;

  /** Conversion rate for the native currency to USD. */
  usdRate: string;
};

/** Request for a quote to retrieve a required token. */
export type QuoteRequest = {
  /** Address of the user's account. */
  from: Hex;

  /** Whether the transaction is a maximum amount transaction. */
  isMaxAmount?: boolean;

  /** Whether this is a post-quote flow. */
  isPostQuote?: boolean;

  /** Whether the source of funds is HyperLiquid (HyperCore). */
  isHyperliquidSource?: boolean;

  /** Whether the source of funds is a Polymarket deposit wallet. */
  isPolymarketDepositWallet?: boolean;

  /** Whether this quote is the direct mUSD-to-Money-Account fiat flow. */
  isDirectMusdMoneyAccount?: boolean;

  /** Overrides the payment source for the transaction. */
  paymentOverride?: PaymentOverride;

  /** Optional recipient address for Relay requests. When set, overrides the default `from` address. */
  recipient?: Hex;

  /**
   * Optional address to receive refunds if the quote provider transaction fails.
   * When set, overrides the default refund recipient (EOA) in the quote
   * request.
   */
  refundTo?: Hex;

  /** Whether to skip processTransactions in relay-quotes. Defaults to `isPostQuote`. */
  skipProcessTransactions?: boolean;

  /** Balance of the source token in atomic format without factoring token decimals. */
  sourceBalanceRaw: string;

  /** Chain ID of the source token. */
  sourceChainId: Hex;

  /** Address of the source token. */
  sourceTokenAddress: Hex;

  /** Amount of the required token in atomic format without factoring token decimals. */
  sourceTokenAmount: string;

  /** Minimum amount required of the target token in atomic format without factoring token decimals. */
  targetAmountMinimum: string;

  /** Chain ID of the target token. */
  targetChainId: Hex;

  /** Address of the target token. */
  targetTokenAddress: Hex;

  /**
   * One-time HyperLiquid activation fee (USD) reserved from the source amount
   * for an unactivated HyperCore account. The source amount sent to the
   * provider is reduced by this amount so HyperLiquid retains enough balance
   * for the fee, and the amount is surfaced as part of the provider fee.
   */
  hyperliquidActivationFeeUsd?: string;
};

/** Fees associated with a transaction pay quote. */
export type TransactionPayFees = {
  /** Whether a gas fee token is used to pay source network fees. */
  isSourceGasFeeToken?: boolean;

  /** Whether a gas fee token is used to pay target network fees. */
  isTargetGasFeeToken?: boolean;

  /** Fee charged by MetaMask. */
  metaMask: FiatValue;

  /** Fee charged by the quote provider. */
  provider: FiatValue;

  /** Fee charged by fiat on-ramp provider (breakdown of the provider total). */
  providerFiat?: FiatValue;

  /** Network fee for transactions on the source network. */
  sourceNetwork: {
    estimate: Amount;
    max: Amount;
  };

  /** Network fee for transactions on the target network. */
  targetNetwork: FiatValue;
};

/** Quote returned to retrieve a required token using the payment token. */
export type TransactionPayQuote<OriginalQuote> = {
  /** Additional amount provided by the quote beyond the minimum requested. */
  dust: FiatValue;

  /** Duration estimated for the transaction to complete in seconds. */
  estimatedDuration: number;

  /** Fees associated with the transaction pay quote. */
  fees: TransactionPayFees;

  /** Raw quote data returned by the provider. */
  original: OriginalQuote;

  /** Associated quote request. */
  request: QuoteRequest;

  /** Amount of source token required. */
  sourceAmount: Amount;

  /** Name of the strategy used to retrieve the quote. */
  strategy: TransactionPayStrategy;

  /** Amount of target token provided. */
  targetAmount: FiatValue;
};

/** Request to get quotes for a transaction. */
export type PayStrategyGetQuotesRequest = {
  /** Whether the account supports EIP-7702 authorization signing. */
  accountSupports7702: boolean;

  /** Selected fiat payment method ID, if applicable. */
  fiatPaymentMethod?: string;

  /**
   * Resolved wallet address for the transaction.
   * This is `accountOverride ?? txParams.from`, pre-computed by the quote
   * orchestrator so that individual strategies do not need to re-derive it.
   */
  from: Hex;

  /** Controller messenger. */
  messenger: TransactionPayControllerMessenger;

  /** Quote requests for required tokens. */
  requests: QuoteRequest[];

  /**
   * Signal that aborts when a newer quote request supersedes this one.
   * Strategies that perform their own network IO should forward this to
   * their fetch calls so cancelled requests release network resources.
   */
  signal?: AbortSignal;

  /** Metadata of the original target transaction. */
  transaction: TransactionMeta;

  /** Revision-bound local preparation for an explicit amount update. */
  transactionPreparation?: Promise<AtomicBatchPreparationResult>;
};

/** Request to submit quotes for a transaction. */
export type PayStrategyExecuteRequest<OriginalRequest> = {
  /** Whether the account supports EIP-7702 authorization signing. */
  accountSupports7702: boolean;

  /** Callback to determine if the transaction is a smart transaction. */
  isSmartTransaction: (chainId: Hex) => boolean;

  /** Controller messenger. */
  messenger: TransactionPayControllerMessenger;

  /** Quotes to be submitted. */
  quotes: TransactionPayQuote<OriginalRequest>[];

  /** Metadata of the original target transaction. */
  transaction: TransactionMeta;
};

/** Request to get batch transactions for quotes. */
export type PayStrategyGetBatchRequest<OriginalQuote> = {
  /** Controller messenger. */
  messenger: TransactionPayControllerMessenger;

  /** Quotes for required tokens. */
  quotes: TransactionPayQuote<OriginalQuote>[];

  /** Signal that aborts when a newer quote request supersedes this one. */
  signal?: AbortSignal;
};

/** Request to check whether retrieved quotes can be executed by a strategy. */
export type PayStrategyCheckQuoteSupportRequest<OriginalQuote> = {
  /** Controller messenger. */
  messenger: TransactionPayControllerMessenger;

  /** Quotes returned by the strategy. */
  quotes: TransactionPayQuote<OriginalQuote>[];

  /** Signal that aborts when a newer quote request supersedes this one. */
  signal?: AbortSignal;

  /** Metadata of the original target transaction. */
  transaction: TransactionMeta;
};

/** Request to get refresh interval for a specific strategy. */
export type PayStrategyGetRefreshIntervalRequest = {
  /** Chain ID of the source or payment token. */
  chainId: Hex;

  /** Controller messenger. */
  messenger: TransactionPayControllerMessenger;
};

/** Strategy used to obtain required tokens for a transaction. */
export type PayStrategy<OriginalQuote> = {
  /**
   * Check if the strategy supports the given request.
   * Defaults to true if not implemented.
   */
  supports?: (
    request: PayStrategyGetQuotesRequest,
  ) => boolean | Promise<boolean>;

  /** Retrieve quotes for required tokens. */
  getQuotes: (
    request: PayStrategyGetQuotesRequest,
  ) => Promise<TransactionPayQuote<OriginalQuote>[]>;

  /**
   * Check if the returned quotes are supported after provider quote
   * construction and gas planning.
   *
   * Use this for limitations that are only knowable once quote metadata is
   * available, such as whether execution will require an EIP-7702
   * authorization list.
   */
  checkQuoteSupport?: (
    request: PayStrategyCheckQuoteSupportRequest<OriginalQuote>,
  ) => boolean | Promise<boolean>;

  /** Retrieve batch transactions for quotes, if supported by the strategy. */
  getBatchTransactions?: (
    request: PayStrategyGetBatchRequest<OriginalQuote>,
  ) => Promise<BatchTransaction[]>;

  /**
   * Retrieve refresh interval for the strategy, if applicable.
   * Defaults to 30 seconds.
   */
  getRefreshInterval?: (
    request: PayStrategyGetRefreshIntervalRequest,
  ) => Promise<number | undefined>;

  /** Execute or submit the quotes to obtain required tokens. */
  execute: (request: PayStrategyExecuteRequest<OriginalQuote>) => Promise<{
    transactionHash?: Hex;
  }>;
};

/** Single fiat value in alternate currencies. */
export type FiatValue = {
  /** Value in the selected fiat currency. */
  fiat: string;

  /** Value in USD. */
  usd: string;
};

/** Calculated totals for a target transaction and all quotes. */
export type TransactionPayTotals = {
  /** Total estimated duration for the target transaction and all quotes. */
  estimatedDuration: number;

  /** Total fees for the target transaction and all quotes. */
  fees: TransactionPayFees;

  /** Total amount of source token required. */
  sourceAmount: Amount;

  /** Total amount of target token provided. */
  targetAmount: FiatValue;

  /** Overall total cost for the target transaction and all quotes. */
  total: FiatValue;
};

/** Request to update the payment token for a transaction. */
export type UpdatePaymentTokenRequest = {
  /** ID of the transaction to update. */
  transactionId: string;

  /** Address of the new payment token. */
  tokenAddress: Hex;

  /** Chain ID of the new payment token. */
  chainId: Hex;
};

/** Request to update fiat payment state for a transaction. */
export type UpdateFiatPaymentRequest = {
  /** ID of the transaction to update. */
  transactionId: string;

  /** Callback to mutate fiat payment state. */
  callback: TransactionFiatPaymentCallback;
};

/** Callback to convert a transaction to a redeem delegation. */
export type GetDelegationTransactionCallback = ({
  transaction,
  isSubsidized,
}: {
  transaction: TransactionMeta;
  isSubsidized?: boolean;
}) => Promise<{
  authorizationList?: AuthorizationList;
  data: Hex;
  to: Hex;
  value: Hex;
}>;

/** Client-supplied callbacks for the Polymarket relayer protocol. */
export type PolymarketCallbacks = {
  /** Derive the deposit-wallet address (CREATE2) for the given EOA. */
  getDepositWalletAddress: (params: { eoa: Hex }) => Promise<Hex>;

  /** Sign and broadcast a deposit-wallet batch, returning the source hash. */
  submitDepositWalletBatch: (params: {
    eoa: Hex;
    depositWallet: Hex;
    calls: { target: Hex; data: Hex; value: string }[];
  }) => Promise<{ sourceHash: Hex }>;
};

/** Single amount in alternate formats. */
export type Amount = FiatValue & {
  /** Amount in human-readable format factoring token decimals. */
  human: string;

  /** Amount in atomic format without factoring token decimals. */
  raw: string;
};
