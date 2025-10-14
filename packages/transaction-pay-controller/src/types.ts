import type {
  CurrencyRateControllerActions,
  TokenBalancesControllerGetStateAction,
} from '@metamask/assets-controllers';
import type { TokenListControllerActions } from '@metamask/assets-controllers';
import type { TokenRatesControllerGetStateAction } from '@metamask/assets-controllers';
import type { TokensControllerGetStateAction } from '@metamask/assets-controllers';
import type { RestrictedMessenger } from '@metamask/base-controller';
import type { ControllerStateChangeEvent } from '@metamask/base-controller';
import type { ControllerGetStateAction } from '@metamask/base-controller';
import type { Messenger } from '@metamask/base-controller';
import type { BridgeControllerActions } from '@metamask/bridge-controller';
import type { BridgeStatusControllerStateChangeEvent } from '@metamask/bridge-status-controller';
import type { BridgeStatusControllerActions } from '@metamask/bridge-status-controller';
import type { NetworkControllerFindNetworkClientIdByChainIdAction } from '@metamask/network-controller';
import type { NetworkControllerGetNetworkClientByIdAction } from '@metamask/network-controller';
import type { RemoteFeatureFlagControllerGetStateAction } from '@metamask/remote-feature-flag-controller';
import type { TransactionControllerUnapprovedTransactionAddedEvent } from '@metamask/transaction-controller';
import type { TransactionControllerGetStateAction } from '@metamask/transaction-controller';
import type { TransactionControllerStateChangeEvent } from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { TransactionControllerAddTransactionAction } from '@metamask/transaction-controller';
import type { TransactionControllerUpdateTransactionAction } from '@metamask/transaction-controller';
import type { Hex, Json } from '@metamask/utils';
import type { Draft } from 'immer';

import type { CONTROLLER_NAME, TransactionPayStrategy } from './constants';

export type AllowedActions =
  | BridgeControllerActions
  | BridgeStatusControllerActions
  | CurrencyRateControllerActions
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

export type TransactionPayControllerGetStrategyAction = {
  type: `${typeof CONTROLLER_NAME}:getStrategy`;
  handler: (transaction: TransactionMeta) => Promise<TransactionPayStrategy>;
};

export type TransactionPayControllerStateChangeEvent =
  ControllerStateChangeEvent<
    typeof CONTROLLER_NAME,
    TransactionPayControllerState
  >;

export type TransactionPayControllerActions =
  | TransactionPayControllerGetStateAction
  | TransactionPayControllerGetStrategyAction;

export type TransactionPayControllerEvents =
  TransactionPayControllerStateChangeEvent;

export type TransactionPayControllerMessenger = RestrictedMessenger<
  typeof CONTROLLER_NAME,
  TransactionPayControllerActions | AllowedActions,
  TransactionPayControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

export type TransactionPayPublishHookMessenger = Messenger<
  | BridgeStatusControllerActions
  | NetworkControllerFindNetworkClientIdByChainIdAction
  | TransactionControllerAddTransactionAction
  | TransactionControllerUpdateTransactionAction
  | TransactionPayControllerGetStateAction
  | TransactionPayControllerGetStrategyAction,
  | BridgeStatusControllerStateChangeEvent
  | TransactionControllerStateChangeEvent
  | TransactionControllerUnapprovedTransactionAddedEvent
>;

export type TransactionPayControllerOptions = {
  getStrategy?: (
    transaction: TransactionMeta,
  ) => Promise<TransactionPayStrategy>;
  messenger: TransactionPayControllerMessenger;
  state?: Partial<TransactionPayControllerState>;
};

export type TransactionPayControllerState = {
  transactionData: Record<string, TransactionData>;
};

export type TransactionData = {
  isLoading: boolean;
  paymentToken?: TransactionPaymentToken;
  quotes?: TransactionPayQuote<Json>[];
  sourceAmounts?: SourceAmountValues[];
  tokens: TransactionToken[];
  totals?: TransactionPayTotals;
};

export type TransactionTokenRequired = {
  address: Hex;
  allowUnderMinimum: boolean;
  amountHuman: string;
  amountRaw: string;
  balanceHuman: string;
  balanceRaw: string;
  chainId: Hex;
  decimals: number;
  skipIfBalance: boolean;
  symbol: string;
};

export type TransactionTokenFiat = {
  amountFiat: string;
  amountUsd: string;
  balanceFiat: string;
  balanceUsd: string;
};

export type SourceAmountValues = {
  sourceAmountHuman: string;
  sourceAmountRaw: string;
  targetTokenAddress: Hex;
};

export type TransactionToken = TransactionTokenRequired & TransactionTokenFiat;

export type TransactionPaymentToken = {
  address: Hex;
  balanceFiat: string;
  balanceHuman: string;
  balanceRaw: string;
  balanceUsd: string;
  chainId: Hex;
  decimals: number;
  symbol: string;
};

export type UpdateTransactionDataCallback = (
  transactionId: string,
  fn: (data: Draft<TransactionData>) => void,
) => void;

export type FiatRates = {
  fiatRate: string;
  usdRate: string;
};

export type QuoteRequest = {
  from: Hex;
  sourceBalanceRaw: string;
  sourceChainId: Hex;
  sourceTokenAddress: Hex;
  sourceTokenAmount: string;
  targetAmountMinimum: string;
  targetChainId: Hex;
  targetTokenAddress: Hex;
};

export type TransactionPayFees = {
  provider: FiatValue;
  sourceNetwork: FiatValue;
  targetNetwork: FiatValue;
};

export type TransactionPayQuote<OriginalQuote> = {
  dust: FiatValue;
  estimatedDuration: number;
  fees: TransactionPayFees;
  original: OriginalQuote;
  request: QuoteRequest;
};

export type PayStrategyGetQuotesRequest = {
  messenger: TransactionPayControllerMessenger;
  requests: QuoteRequest[];
};

export type PayStrategyExecuteRequest<OriginalRequest> = {
  isSmartTransaction: (chainId: Hex) => boolean;
  messenger: TransactionPayPublishHookMessenger;
  quotes: TransactionPayQuote<OriginalRequest>[];
  transaction: TransactionMeta;
};

export type PayStrategy<OriginalQuote> = {
  getQuotes: (
    request: PayStrategyGetQuotesRequest,
  ) => Promise<TransactionPayQuote<OriginalQuote>[]>;

  execute: (request: PayStrategyExecuteRequest<OriginalQuote>) => Promise<{
    transactionHash?: Hex;
  }>;
};

export type FiatValue = {
  fiat: string;
  usd: string;
};

export type TransactionPayTotals = {
  estimatedDuration: number;
  fees: TransactionPayFees;
  total: FiatValue;
};
