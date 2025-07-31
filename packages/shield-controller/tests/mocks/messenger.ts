import { Messenger } from '@metamask/base-controller';

import type {
  ShieldControllerActions,
  ShieldControllerEvents,
  ShieldControllerAllowedActions,
  ShieldControllerAllowedEvents,
} from '../../src';
import { controllerName } from '../../src/constants';

/**
 *
 */
export function createMockMessenger() {
  const baseMessenger = new Messenger<
    ShieldControllerActions | ShieldControllerAllowedActions,
    ShieldControllerEvents | ShieldControllerAllowedEvents
  >();
  const messenger = baseMessenger.getRestricted({
    name: controllerName,
    allowedActions: ['AuthenticationController:getBearerToken'],
    allowedEvents: [
      'TransactionController:unapprovedTransactionAdded',
      'TransactionController:transactionSimulated',
    ],
  });

  return {
    baseMessenger,
    messenger,
  };
}
