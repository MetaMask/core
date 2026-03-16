import type {
  KeyringControllerAddNewKeyringAction,
  KeyringControllerGetKeyringsByTypeAction,
  KeyringControllerGetStateAction,
} from '@metamask/keyring-controller';
import type { Messenger } from '@metamask/messenger';

import type { serviceName } from './CashAccountService';
import type { CashAccountServiceMethodActions } from './CashAccountService-method-action-types';

export type CashAccountServiceActions = CashAccountServiceMethodActions;

type AllowedActions =
  | KeyringControllerGetStateAction
  | KeyringControllerGetKeyringsByTypeAction
  | KeyringControllerAddNewKeyringAction;

type AllowedEvents = never;

export type CashAccountServiceMessenger = Messenger<
  typeof serviceName,
  CashAccountServiceActions | AllowedActions,
  AllowedEvents
>;
