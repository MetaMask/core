import type {
  KeyringControllerAddNewKeyringAction,
  KeyringControllerWithKeyringAction,
} from '@metamask/keyring-controller';
import type { Messenger } from '@metamask/messenger';

import type { serviceName } from './CashAccountService';
import type { CashAccountServiceMethodActions } from './CashAccountService-method-action-types';

export type CashAccountServiceActions = CashAccountServiceMethodActions;

type AllowedActions =
  | KeyringControllerWithKeyringAction
  | KeyringControllerAddNewKeyringAction;

type AllowedEvents = never;

export type CashAccountServiceMessenger = Messenger<
  typeof serviceName,
  CashAccountServiceActions | AllowedActions,
  AllowedEvents
>;
