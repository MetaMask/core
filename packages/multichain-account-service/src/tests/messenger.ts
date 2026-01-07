import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';

import type { MultichainAccountServiceMessenger } from '../types';

type AllMultichainAccountServiceActions =
  MessengerActions<MultichainAccountServiceMessenger>;

type AllMultichainAccountServiceEvents =
  MessengerEvents<MultichainAccountServiceMessenger>;

export type RootMessenger = Messenger<
  MockAnyNamespace,
  AllMultichainAccountServiceActions,
  AllMultichainAccountServiceEvents
>;

/**
 * Creates and returns a root messenger for testing
 *
 * @returns A messenger instance
 */
export function getRootMessenger(): RootMessenger {
  return new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
    captureException: jest.fn(),
  });
}

/**
 * Retrieves a restricted messenger for the MultichainAccountService.
 *
 * @param rootMessenger - The root messenger instance. Defaults to a new Messenger created by getRootMessenger().
 * @returns The restricted messenger for the MultichainAccountService.
 */
export function getMultichainAccountServiceMessenger(
  rootMessenger: RootMessenger,
): MultichainAccountServiceMessenger {
  const messenger = new Messenger<
    'MultichainAccountService',
    AllMultichainAccountServiceActions,
    AllMultichainAccountServiceEvents,
    RootMessenger
  >({
    namespace: 'MultichainAccountService',
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    messenger,
    actions: [
      'AccountsController:getAccount',
      'AccountsController:getAccountByAddress',
      'AccountsController:listMultichainAccounts',
      'SnapController:handleRequest',
      'KeyringController:withKeyring',
      'KeyringController:getState',
      'KeyringController:getKeyringsByType',
      'KeyringController:addNewKeyring',
      'NetworkController:findNetworkClientIdByChainId',
      'NetworkController:getNetworkClientById',
      'KeyringController:createNewVaultAndKeychain',
      'KeyringController:createNewVaultAndRestore',
      'AccountsController:getAccounts',
    ],
    events: [
      'KeyringController:stateChange',
      'AccountsController:accountAdded',
      'AccountsController:accountRemoved',
    ],
  });
  return messenger;
}
