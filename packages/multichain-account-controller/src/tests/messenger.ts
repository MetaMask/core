import { Messenger } from '@metamask/base-controller';

import type {
  AllowedActions,
  AllowedEvents,
  MultichainAccountControllerActions,
  MultichainAccountControllerEvents,
  MultichainAccountControllerMessenger,
} from '../types';

/**
 * Creates a new root messenger instance for testing.
 *
 * @returns A new Messenger instance.
 */
export function getRootMessenger() {
  return new Messenger<
    MultichainAccountControllerActions | AllowedActions,
    MultichainAccountControllerEvents | AllowedEvents
  >();
}

/**
 * Retrieves a restricted messenger for the MultichainAccountController.
 *
 * @param messenger - The root messenger instance. Defaults to a new Messenger created by getRootMessenger().
 * @returns The restricted messenger for the MultichainAccountController.
 */
export function getMultichainAccountControllerMessenger(
  messenger = getRootMessenger(),
): MultichainAccountControllerMessenger {
  return messenger.getRestricted({
    name: 'MultichainAccountController',
    allowedEvents: [],
    allowedActions: [
      'AccountsController:getAccount',
      'AccountsController:getAccountByAddress',
      'AccountsController:listMultichainAccounts',
      'SnapController:handleRequest',
      'KeyringController:withKeyring',
    ],
  });
}
