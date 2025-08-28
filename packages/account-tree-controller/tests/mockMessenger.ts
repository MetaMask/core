import {
  Messenger,
  type MessengerActions,
  type MessengerEvents,
} from '@metamask/messenger';
import type { GetSnap } from '@metamask/snaps-controllers';

import type {
  AccountsControllerAccountAddedEvent,
  AccountsControllerAccountRemovedEvent,
  AccountsControllerAccountRenamedEvent,
  AccountsControllerGetAccountAction,
  AccountsControllerGetSelectedAccountAction,
  AccountsControllerListMultichainAccountsAction,
  AccountsControllerSelectedAccountChangeEvent,
  AccountsControllerSetSelectedAccountAction,
} from '../../accounts-controller/src/AccountsController';
import type { KeyringControllerGetStateAction } from '../../keyring-controller/src/KeyringController';
import type { AccountTreeControllerMessenger } from '../src/types';

type AllAccountTreeControllerActions =
  MessengerActions<AccountTreeControllerMessenger>;

type AllAccountTreeControllerEvents =
  MessengerEvents<AccountTreeControllerMessenger>;

/**
 * Creates a new root messenger instance for testing.
 *
 * @returns A new Messenger instance.
 */
export function getRootMessenger() {
  return new Messenger<
    'Root',
    AllAccountTreeControllerActions,
    AllAccountTreeControllerEvents
  >({ namespace: 'Root' });
}

/**
 * Retrieves a messenger for the AccountTreeController.
 *
 * @param rootMessenger - The root messenger instance.
 * @returns The messenger for the AccountTreeController.
 */
export function getAccountTreeControllerMessenger(
  rootMessenger: ReturnType<typeof getRootMessenger>,
): AccountTreeControllerMessenger {
  const accountTreeControllerMessenger = new Messenger<
    'AccountTreeController',
    AllAccountTreeControllerActions,
    AllAccountTreeControllerEvents,
    typeof rootMessenger
  >({ namespace: 'AccountTreeController', parent: rootMessenger });
  rootMessenger.delegate({
    messenger: accountTreeControllerMessenger,
    events: [
      'AccountsController:accountAdded',
      'AccountsController:accountRemoved',
      'AccountsController:accountRenamed',
      'AccountsController:selectedAccountChange',
    ],
    actions: [
      'AccountsController:listMultichainAccounts',
      'AccountsController:getAccount',
      'AccountsController:getSelectedAccount',
      'AccountsController:setSelectedAccount',
      'KeyringController:getState',
      'SnapController:get',
    ],
  });
  return accountTreeControllerMessenger;
}

/**
 * Retrieves a messenger for the AccountsController.
 *
 * @param rootMessenger - The root messenger instance.
 * @returns The messenger for the AccountsController.
 */
export function getAccountsControllerMessenger(
  rootMessenger: ReturnType<typeof getRootMessenger>,
): Messenger<
  'AccountsController',
  | AccountsControllerGetAccountAction
  | AccountsControllerGetSelectedAccountAction
  | AccountsControllerListMultichainAccountsAction
  | AccountsControllerSetSelectedAccountAction,
  | AccountsControllerAccountAddedEvent
  | AccountsControllerAccountRemovedEvent
  | AccountsControllerAccountRenamedEvent
  | AccountsControllerSelectedAccountChangeEvent,
  typeof rootMessenger
> {
  return new Messenger<
    'AccountsController',
    | AccountsControllerGetAccountAction
    | AccountsControllerGetSelectedAccountAction
    | AccountsControllerListMultichainAccountsAction
    | AccountsControllerSetSelectedAccountAction,
    | AccountsControllerAccountAddedEvent
    | AccountsControllerAccountRemovedEvent
    | AccountsControllerAccountRenamedEvent
    | AccountsControllerSelectedAccountChangeEvent,
    typeof rootMessenger
  >({ namespace: 'AccountsController', parent: rootMessenger });
}

/**
 * Retrieves a messenger for the KeyringController.
 *
 * @param rootMessenger - The root messenger instance.
 * @returns The messenger for the KeyringController.
 */
export function getKeyringControllerMessenger(
  rootMessenger: ReturnType<typeof getRootMessenger>,
): Messenger<
  'KeyringController',
  KeyringControllerGetStateAction,
  never,
  typeof rootMessenger
> {
  return new Messenger<
    'KeyringController',
    KeyringControllerGetStateAction,
    never,
    typeof rootMessenger
  >({ namespace: 'KeyringController', parent: rootMessenger });
}

/**
 * Retrieves a messenger for the SnapController.
 *
 * @param rootMessenger - The root messenger instance.
 * @returns The messenger for the SnapController.
 */
export function getSnapControllerMessenger(
  rootMessenger: ReturnType<typeof getRootMessenger>,
): Messenger<'SnapController', GetSnap, never, typeof rootMessenger> {
  return new Messenger<'SnapController', GetSnap, never, typeof rootMessenger>({
    namespace: 'SnapController',
    parent: rootMessenger,
  });
}
