import type { TokenBalancesControllerGetStateAction } from '@metamask/assets-controllers';
import type { TokenListControllerActions } from '@metamask/assets-controllers';
import type { RestrictedMessenger } from '@metamask/base-controller';
import type { ControllerStateChangeEvent } from '@metamask/base-controller';
import type { ControllerGetStateAction } from '@metamask/base-controller';
import type { QuoteMetadata, QuoteResponse } from '@metamask/bridge-controller';
import type { BridgeStatusControllerStateChangeEvent } from '@metamask/bridge-status-controller';
import type { BridgeStatusControllerActions } from '@metamask/bridge-status-controller';
import type { TransactionControllerUnapprovedTransactionAddedEvent } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

export const controllerName = 'TransactionPayController';

type AllowedActions =
  | BridgeStatusControllerActions
  | TokenBalancesControllerGetStateAction
  | TokenListControllerActions;

type AllowedEvents =
  | BridgeStatusControllerStateChangeEvent
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
  quotes: TransactionBridgeQuote[];
};

export type TransactionBridgeQuote = QuoteResponse & QuoteMetadata;

export type RequiredTransactionToken = {
  address: Hex;
  allowUnderMinimum: boolean;
  amountRaw: string;
  amountHuman: string;
  balanceRaw: string;
  balanceHuman: string;
  decimals: number;
  skipIfBalance: boolean;
};
