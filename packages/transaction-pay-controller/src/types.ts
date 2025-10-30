import type {
  CurrencyRateControllerActions,
  TokenBalancesControllerGetStateAction,
} from '@metamask/assets-controllers';
import type { TokenListControllerActions } from '@metamask/assets-controllers';
import type { TokenRatesControllerGetStateAction } from '@metamask/assets-controllers';
import type { TokensControllerGetStateAction } from '@metamask/assets-controllers';
import type { AccountTrackerControllerGetStateAction } from '@metamask/assets-controllers';
import type { ControllerStateChangeEvent } from '@metamask/base-controller';
import type { ControllerGetStateAction } from '@metamask/base-controller';
import type { BridgeControllerActions } from '@metamask/bridge-controller';
import type { BridgeStatusControllerStateChangeEvent } from '@metamask/bridge-status-controller';
import type { BridgeStatusControllerActions } from '@metamask/bridge-status-controller';
import type { GasFeeControllerActions } from '@metamask/gas-fee-controller';
import type { Messenger } from '@metamask/messenger';
import type { NetworkControllerFindNetworkClientIdByChainIdAction } from '@metamask/network-controller';
import type { NetworkControllerGetNetworkClientByIdAction } from '@metamask/network-controller';
import type { RemoteFeatureFlagControllerGetStateAction } from '@metamask/remote-feature-flag-controller';
import type { TransactionControllerUnapprovedTransactionAddedEvent } from '@metamask/transaction-controller';
import type { TransactionControllerGetStateAction } from '@metamask/transaction-controller';
import type { TransactionControllerStateChangeEvent } from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { TransactionControllerAddTransactionAction } from '@metamask/transaction-controller';
import type { TransactionControllerUpdateTransactionAction } from '@metamask/transaction-controller';
import type { BatchTransaction } from '@metamask/transaction-controller';
import type { Hex, Json } from '@metamask/utils';
import type { Draft } from 'immer';

import type { CONTROLLER_NAME, TransactionPayStrategy } from './constants';

export type AllowedActions =
  | AccountTrackerControllerGetStateAction
  | BridgeControllerActions
  | BridgeStatusControllerActions
  | CurrencyRateControllerActions
  | GasFeeControllerActions
  | NetworkControllerFindNetworkClientIdByChainIdAction
  | NetworkControllerGetNetworkClientByIdAction
  | RemoteFeatureFlagControllerGetStateAction
  | TokenBalancesControllerGetStateAction
  | TokenListControllerActions
  | TokenRatesControllerGetStateAction
  | TokensControllerGetStateAction
  | TransactionControllerAddTransactionAction
  | TransactionControllerGetStateAction
  | TransactionControllerUpdateTransactionAction;

export type AllowedEvents =
  | BridgeStatusControllerStateChangeEvent
  | TransactionControllerStateChangeEvent
  | TransactionControllerUnapprovedTransactionAddedEvent;

export type TransactionPayControllerGetStateAction = ControllerGetStateAction<
  typeof CONTROLLER_NAME,
  TransactionPayControllerState
>;

/** Action to get the pay strategy type used for a transaction. */
export type TransactionPayControllerGetStrategyAction = {
  type: `${typeof CONTROLLER_NAME}:getStrategy`;
  handler: (transaction: TransactionMeta) => Promise<TransactionPayStrategy>;
};

/** Action to update the payment token for a transaction. */
export type TransactionPayControllerUpdatePaymentTokenAction = {
  type: `${typeof CONTROLLER_NAME}:updatePaymentToken`;
  handler: (request: UpdatePaymentTokenRequest) => void;
};

export type TransactionPayControllerStateChangeEvent =
  ControllerStateChangeEvent<
    typeof CONTROLLER_NAME,
    TransactionPayControllerState
  >;

export type TransactionPayControllerActions =
  | TransactionPayControllerGetStateAction
  | TransactionPayControllerGetStrategyAction
  | TransactionPayControllerUpdatePaymentTokenAction;

export type TransactionPayControllerEvents =
  TransactionPayControllerStateChangeEvent;

export type TransactionPayControllerMessenger = Messenger<
  typeof CONTROLLER_NAME,
  TransactionPayControllerActions | AllowedActions,
  TransactionPayControllerEvents | AllowedEvents
>;

/** Options for the TransactionPayController. */
export type TransactionPayControllerOptions = {
  /** Callback to select the PayStrategy for a transaction. */
  getStrategy?: (
    transaction: TransactionMeta,
  ) => Promise<TransactionPayStrategy>;

  /** Controller messenger. */
  messenger: TransactionPayControllerMessenger;

  /** Initial state of the controller. */
  state?: Partial<TransactionPayControllerState>;
};

/** State of the TransactionPayController. */
export type TransactionPayControllerState = {
  /** State relating to each transaction, keyed by transaction ID. */
  transactionData: Record<string, TransactionData>;
};

/** State relating to a single transaction. */
export type TransactionData = {
  /** Whether quotes are currently being retrieved. */
  isLoading: boolean;

  /** Source token selected for the transaction. */
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

  /** Address of the required token. */
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
};

/** Fees associated with a transaction pay quote. */
export type TransactionPayFees = {
  /** Fee charged by the quote provider. */
  provider: FiatValue;

  /** Network fee for transactions on the source network. */
  sourceNetwork: FiatValue;

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

  /** Name of the strategy used to retrieve the quote. */
  strategy: TransactionPayStrategy;
};

/** Request to get quotes for a transaction. */
export type PayStrategyGetQuotesRequest = {
  /** Controller messenger. */
  messenger: TransactionPayControllerMessenger;

  /** Quote requests for required tokens. */
  requests: QuoteRequest[];

  /** Metadata of the original target transaction. */
  transaction: TransactionMeta;
};

/** Request to submit quotes for a transaction. */
export type PayStrategyExecuteRequest<OriginalRequest> = {
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
  /** Retrieve quotes for required tokens. */
  getQuotes: (
    request: PayStrategyGetQuotesRequest,
  ) => Promise<TransactionPayQuote<OriginalQuote>[]>;

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
