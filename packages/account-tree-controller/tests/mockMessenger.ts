import {
  Messenger,
  MOCK_ANY_NAMESPACE,
  type MockAnyNamespace,
  type MessengerActions,
  type MessengerEvents,
} from '@metamask/messenger';

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
    MockAnyNamespace,
    AllAccountTreeControllerActions,
    AllAccountTreeControllerEvents
  >({ namespace: MOCK_ANY_NAMESPACE });
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
      'AccountsController:selectedAccountChange',
      'UserStorageController:stateChange',
      'MultichainAccountService:walletStatusChange',
    ],
    actions: [
      'AccountsController:listMultichainAccounts',
      'AccountsController:getAccount',
      'AccountsController:getSelectedMultichainAccount',
      'AccountsController:setSelectedAccount',
      'UserStorageController:getState',
      'UserStorageController:performGetStorage',
      'UserStorageController:performGetStorageAllFeatureEntries',
      'UserStorageController:performSetStorage',
      'UserStorageController:performBatchSetStorage',
      'AuthenticationController:getSessionProfile',
      'MultichainAccountService:createMultichainAccountGroup',
      'KeyringController:getState',
      'SnapController:get',
    ],
  });
  return accountTreeControllerMessenger;
}
