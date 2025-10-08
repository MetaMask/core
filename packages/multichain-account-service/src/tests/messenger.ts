import { Messenger } from '@metamask/base-controller';

import type {
  AllowedActions,
  AllowedEvents,
  MultichainAccountServiceActions,
  MultichainAccountServiceEvents,
  MultichainAccountServiceMessenger,
} from '../types';

/**
 * Creates a new root messenger instance for testing.
 *
 * @returns A new Messenger instance.
 */
export function getRootMessenger() {
  return new Messenger<
    MultichainAccountServiceActions | AllowedActions,
    MultichainAccountServiceEvents | AllowedEvents
  >();
}

/**
 * Retrieves a restricted messenger for the MultichainAccountService.
 *
 * @param messenger - The root messenger instance. Defaults to a new Messenger created by getRootMessenger().
 * @returns The restricted messenger for the MultichainAccountService.
 */
export function getMultichainAccountServiceMessenger(
  messenger: ReturnType<typeof getRootMessenger>,
): MultichainAccountServiceMessenger {
  return messenger.getRestricted({
    name: 'MultichainAccountService',
    allowedEvents: [
      'KeyringController:stateChange',
      'AccountsController:accountAdded',
      'AccountsController:accountRemoved',
    ],
    allowedActions: [
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
    ],
  });
}
