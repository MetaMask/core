import { Messenger } from '@metamask/base-controller';

import type {
  ExtractAvailableAction,
  ExtractAvailableEvent,
} from '../../../base-controller/tests/helpers';
import type { ShieldControllerActions } from '../../src';
import {
  type ShieldControllerEvents,
  type ShieldControllerMessenger,
} from '../../src';
import { controllerName } from '../../src/constants';

/**
 * Create a mock messenger.
 *
 * @returns A mock messenger.
 */
export function createMockMessenger() {
  const baseMessenger = new Messenger<
    ShieldControllerActions | ExtractAvailableAction<ShieldControllerMessenger>,
    ShieldControllerEvents | ExtractAvailableEvent<ShieldControllerMessenger>
  >();
  const messenger = baseMessenger.getRestricted({
    name: controllerName,
    allowedActions: [
      'AccountsController:getSelectedAccount',
      'SubscriptionController:getState',
      'SubscriptionController:getSubscriptions',
      'SubscriptionController:startSubscriptionWithCrypto',
      'SubscriptionController:getCryptoApproveTransactionParams',
    ],
    allowedEvents: [
      'SignatureController:stateChange',
      'TransactionController:stateChange',
      'TransactionController:transactionSubmitted',
    ],
  });

  return {
    baseMessenger,
    messenger,
  };
}
