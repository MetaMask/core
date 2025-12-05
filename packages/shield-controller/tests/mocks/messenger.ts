import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';

import type { ShieldControllerMessenger } from '../../src';
import { controllerName } from '../../src/constants';

type AllShieldControllerActions = MessengerActions<ShieldControllerMessenger>;

type AllShieldControllerEvents = MessengerEvents<ShieldControllerMessenger>;

type RootMessenger = Messenger<
  MockAnyNamespace,
  AllShieldControllerActions,
  AllShieldControllerEvents
>;

/**
 * Constructs the root messenger.
 *
 * @returns A root messenger.
 */
function getRootMessenger(): RootMessenger {
  return new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });
}

/**
 * Create a mock messenger.
 *
 * @returns A mock messenger.
 */
export function createMockMessenger(): {
  rootMessenger: RootMessenger;
  messenger: ShieldControllerMessenger;
} {
  const rootMessenger = getRootMessenger();
  const messenger = new Messenger<
    typeof controllerName,
    AllShieldControllerActions,
    AllShieldControllerEvents,
    RootMessenger
  >({
    namespace: controllerName,
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    messenger,
    events: [
      'SignatureController:stateChange',
      'TransactionController:stateChange',
    ],
  });

  return {
    rootMessenger,
    messenger,
  };
}
