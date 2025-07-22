import { Messenger } from '@metamask/base-controller';

import { controllerName } from '../../src/constants';
import type {
  ShieldControllerActions,
  ShieldControllerEvents,
} from '../../src/ShieldController';
import {
  type AllowedActions,
  type AllowedEvents,
  type ShieldControllerMessenger,
} from '../../src/ShieldController';

/**
 *
 */
export function createMockMessenger() {
  const baseMessenger = new Messenger<
    ShieldControllerActions | AllowedActions,
    ShieldControllerEvents | AllowedEvents
  >();
  const messenger = baseMessenger.getRestricted({
    name: controllerName,
    allowedActions: [],
    allowedEvents: ['TransactionController:unapprovedTransactionAdded'],
  });

  return {
    baseMessenger,
    messenger,
  };
}
