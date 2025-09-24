import type { RestrictedMessenger } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { BridgeStatusControllerStateChangeEvent } from '@metamask/bridge-status-controller';
import type { BridgeStatusControllerActions } from '@metamask/bridge-status-controller';
import type { TransactionControllerUnapprovedTransactionAddedEvent } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

const controllerName = 'TransactionPayController';

const stateMetadata = {
  test: { persist: false, anonymous: false },
};

export type TransactionPayControllerState = {
  test: boolean;
};

export type TransactionPayControllerActions = BridgeStatusControllerActions;

export type TransactionPayControllerEvents =
  | BridgeStatusControllerStateChangeEvent
  | TransactionControllerUnapprovedTransactionAddedEvent;

export type TransactionPayControllerMessenger = RestrictedMessenger<
  typeof controllerName,
  TransactionPayControllerActions,
  TransactionPayControllerEvents,
  TransactionPayControllerActions['type'],
  TransactionPayControllerEvents['type']
>;

export class TransactionPayController extends BaseController<
  typeof controllerName,
  TransactionPayControllerState,
  TransactionPayControllerMessenger
> {}
