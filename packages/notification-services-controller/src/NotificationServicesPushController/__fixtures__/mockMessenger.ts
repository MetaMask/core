import { Messenger } from '@metamask/base-controller';

import type {
  AllowedActions,
  AllowedEvents,
  NotificationServicesPushControllerMessenger,
} from '..';

export const buildPushPlatformNotificationsControllerMessenger =
  (): NotificationServicesPushControllerMessenger => {
    const globalMessenger = new Messenger<AllowedActions, AllowedEvents>();

    return globalMessenger.getRestricted<
      'NotificationServicesPushController',
      AllowedActions['type']
    >({
      name: 'NotificationServicesPushController',
      allowedActions: ['AuthenticationController:getBearerToken'],
      allowedEvents: [],
    });
  };
