import {
  Messenger,
  MOCK_ANY_NAMESPACE,
  type MessengerActions,
  type MessengerEvents,
  type MockAnyNamespace,
} from '@metamask/messenger';

import type { NotificationServicesPushControllerMessenger } from '..';

const controllerName = 'NotificationServicesPushController';

type AllNotificationServicesPushControllerActions =
  MessengerActions<NotificationServicesPushControllerMessenger>;

type AllNotificationServicesPushControllerEvents =
  MessengerEvents<NotificationServicesPushControllerMessenger>;

type RootMessenger = Messenger<
  MockAnyNamespace,
  AllNotificationServicesPushControllerActions,
  AllNotificationServicesPushControllerEvents
>;

/**
 * Creates and returns a root messenger for testing
 *
 * @returns A messenger instance
 */
function getRootMessenger(): RootMessenger {
  return new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });
}

export const buildPushPlatformNotificationsControllerMessenger =
  (): NotificationServicesPushControllerMessenger => {
    const rootMessenger = getRootMessenger();

    const messenger = new Messenger<
      typeof controllerName,
      AllNotificationServicesPushControllerActions,
      AllNotificationServicesPushControllerEvents,
      RootMessenger
    >({
      namespace: controllerName,
      parent: rootMessenger,
    });

    rootMessenger.delegate({
      messenger,
      actions: ['AuthenticationController:getBearerToken'],
      events: [],
    });

    return messenger;
  };
