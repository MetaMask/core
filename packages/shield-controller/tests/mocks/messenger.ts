import { Messenger } from '@metamask/base-controller';

import type {
  ShieldControllerActions,
  ShieldControllerEvents,
  ShieldControllerAllowedActions,
  ShieldControllerAllowedEvents,
} from '../../src';
import { controllerName } from '../../src/constants';

/**
 * Create a mock messenger.
 *
 * @returns A mock messenger.
 */
export function createMockMessenger() {
  const baseMessenger = new Messenger<
    ShieldControllerActions | ShieldControllerAllowedActions,
    ShieldControllerEvents | ShieldControllerAllowedEvents
  >();
  const messenger = baseMessenger.getRestricted({
    name: controllerName,
    allowedActions: [],
    allowedEvents: ['TransactionController:stateChange'],
  });

  return {
    baseMessenger,
    messenger,
  };
}
