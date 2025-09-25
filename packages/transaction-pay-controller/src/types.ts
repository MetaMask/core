import type {
  CurrencyRateControllerActions,
  TokenBalancesControllerGetStateAction,
} from '@metamask/assets-controllers';
import type { TokenListControllerActions } from '@metamask/assets-controllers';
import type { TokenRatesControllerGetStateAction } from '@metamask/assets-controllers';
import type { RestrictedMessenger } from '@metamask/base-controller';
import type { ControllerStateChangeEvent } from '@metamask/base-controller';
import type { ControllerGetStateAction } from '@metamask/base-controller';
import type { QuoteMetadata, QuoteResponse } from '@metamask/bridge-controller';
import type { BridgeStatusControllerStateChangeEvent } from '@metamask/bridge-status-controller';
import type { BridgeStatusControllerActions } from '@metamask/bridge-status-controller';
import type { NetworkControllerFindNetworkClientIdByChainIdAction } from '@metamask/network-controller';
import type { NetworkControllerGetNetworkClientByIdAction } from '@metamask/network-controller';
import type { TransactionControllerUnapprovedTransactionAddedEvent } from '@metamask/transaction-controller';
import type { TransactionControllerGetStateAction } from '@metamask/transaction-controller';
import type { TransactionControllerStateChangeEvent } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

export const controllerName = 'TransactionPayController';

export type AllowedActions =
  | BridgeStatusControllerActions
  | CurrencyRateControllerActions
  | NetworkControllerFindNetworkClientIdByChainIdAction
  | NetworkControllerGetNetworkClientByIdAction
  | TokenBalancesControllerGetStateAction
  | TokenListControllerActions
  | TokenRatesControllerGetStateAction
  | TransactionControllerGetStateAction;

export type AllowedEvents =
  | BridgeStatusControllerStateChangeEvent
  | TransactionControllerStateChangeEvent
  | TransactionControllerUnapprovedTransactionAddedEvent;

export type TransactionPayControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  TransactionPayControllerState
>;

export type TransactionPayControllerStateChangeEvent =
  ControllerStateChangeEvent<
    typeof controllerName,
    TransactionPayControllerState
  >;

export type TransactionPayControllerActions =
  TransactionPayControllerGetStateAction;

export type TransactionPayControllerEvents =
  TransactionPayControllerStateChangeEvent;

export type TransactionPayControllerMessenger = RestrictedMessenger<
  typeof controllerName,
  TransactionPayControllerActions | AllowedActions,
  TransactionPayControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

export type TransactionPayControllerOptions = {
  messenger: TransactionPayControllerMessenger;
  state?: Partial<TransactionPayControllerState>;
};

export type TransactionPayControllerState = {
  transactionData: Record<string, TransactionData>;
};

export type TransactionData = {
  paymentToken?: TransactionPaymentToken;
  quotes?: TransactionBridgeQuote[];
  tokens: TransactionToken[];
};

export type TransactionBridgeQuote = QuoteResponse & QuoteMetadata;

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
};

export type TransactionTokenFiat = {
  amountFiat: string;
  amountUsd: string;
};

export type TransactionToken = TransactionTokenRequired & TransactionTokenFiat;

export type TransactionPaymentToken = {
  address: Hex;
  balanceHuman: string;
  balanceRaw: string;
  chainId: Hex;
  decimals: number;
};
