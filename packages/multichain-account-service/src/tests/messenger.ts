import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';

import type { MultichainAccountServiceMessenger } from '../types';

export type AllMultichainAccountServiceActions =
  MessengerActions<MultichainAccountServiceMessenger>;

export type AllMultichainAccountServiceEvents =
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
 * @param extra - Extra messenger options.
 * @param extra.actions - Extra actions to delegate.
 * @param extra.events - Extra events to delegate.
 * @returns The restricted messenger for the MultichainAccountService.
 */
export function getMultichainAccountServiceMessenger(
  rootMessenger: RootMessenger,
  extra?: {
    actions?: AllMultichainAccountServiceActions['type'][];
    events?: AllMultichainAccountServiceEvents['type'][];
  },
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
      'SnapController:getState',
      'SnapController:handleRequest',
      'KeyringController:withKeyring',
      'KeyringController:getState',
      'KeyringController:getKeyringsByType',
      'KeyringController:addNewKeyring',
      'NetworkController:findNetworkClientIdByChainId',
      'NetworkController:getNetworkClientById',
      ...(extra?.actions ?? []),
    ],
    events: [
      'KeyringController:stateChange',
      'SnapController:stateChange',
      'AccountsController:accountAdded',
      'AccountsController:accountRemoved',
      ...(extra?.events ?? []),
    ],
  });
  return messenger;
}
