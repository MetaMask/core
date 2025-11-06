import {
  Messenger,
  MOCK_ANY_NAMESPACE,
  type MessengerActions,
  type MessengerEvents,
  type MockAnyNamespace,
} from '@metamask/messenger';

import { type ClaimsControllerMessenger } from '../../src';
import { CONTROLLER_NAME } from '../../src/constants';

type AllShieldControllerActions = MessengerActions<ClaimsControllerMessenger>;

type AllShieldControllerEvents = MessengerEvents<ClaimsControllerMessenger>;

export type RootMessenger = Messenger<
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
  messenger: ClaimsControllerMessenger;
} {
  const rootMessenger = getRootMessenger();
  const messenger = new Messenger<
    typeof CONTROLLER_NAME,
    AllShieldControllerActions,
    AllShieldControllerEvents,
    RootMessenger
  >({
    namespace: CONTROLLER_NAME,
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    messenger,
    events: [],
  });

  return {
    rootMessenger,
    messenger,
  };
}
