import type {
  RestrictedControllerMessenger,
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { AuthenticationController } from '@metamask/profile-sync-controller';
import log from 'loglevel';

import type { Types } from '../NotificationServicesController';
import { createRegToken, deleteRegToken } from './services/push/push-web';
import {
  activatePushNotifications,
  deactivatePushNotifications,
  listenToPushNotifications,
  updateTriggerPushNotifications,
} from './services/services';
import type { PushNotificationEnv } from './types';

const controllerName = 'NotificationServicesPushController';

export type NotificationServicesPushControllerState = {
  fcmToken: string;
};

export type NotificationServicesPushControllerGetStateAction =
  ControllerGetStateAction<
    typeof controllerName,
    NotificationServicesPushControllerState
  >;

export type NotificationServicesPushControllerEnablePushNotificationsAction = {
  type: `${typeof controllerName}:enablePushNotifications`;
  handler: NotificationServicesPushController['enablePushNotifications'];
};
export type NotificationServicesPushControllerDisablePushNotificationsAction = {
  type: `${typeof controllerName}:disablePushNotifications`;
  handler: NotificationServicesPushController['disablePushNotifications'];
};
export type NotificationServicesPushControllerUpdateTriggerPushNotificationsAction =
  {
    type: `${typeof controllerName}:updateTriggerPushNotifications`;
    handler: NotificationServicesPushController['updateTriggerPushNotifications'];
  };
export type NotificationServicesPushControllerSubscribeToNotificationsAction = {
  type: `${typeof controllerName}:subscribeToPushNotifications`;
  handler: NotificationServicesPushController['subscribeToPushNotifications'];
};

export type Actions =
  | NotificationServicesPushControllerGetStateAction
  | NotificationServicesPushControllerEnablePushNotificationsAction
  | NotificationServicesPushControllerDisablePushNotificationsAction
  | NotificationServicesPushControllerUpdateTriggerPushNotificationsAction
  | NotificationServicesPushControllerSubscribeToNotificationsAction;

export type AllowedActions =
  AuthenticationController.AuthenticationControllerGetBearerToken;

export type NotificationServicesPushControllerStateChangeEvent =
  ControllerStateChangeEvent<
    typeof controllerName,
    NotificationServicesPushControllerState
  >;

export type NotificationServicesPushControllerOnNewNotificationEvent = {
  type: `${typeof controllerName}:onNewNotifications`;
  payload: [Types.INotification];
};

export type NotificationServicesPushControllerPushNotificationClickedEvent = {
  type: `${typeof controllerName}:pushNotificationClicked`;
  payload: [Types.INotification];
};

export type Events =
  | NotificationServicesPushControllerStateChangeEvent
  | NotificationServicesPushControllerOnNewNotificationEvent
  | NotificationServicesPushControllerPushNotificationClickedEvent;

export type AllowedEvents = never;

export type NotificationServicesPushControllerMessenger =
  RestrictedControllerMessenger<
    typeof controllerName,
    Actions | AllowedActions,
    Events | AllowedEvents,
    AllowedActions['type'],
    AllowedEvents['type']
  >;

export const defaultState: NotificationServicesPushControllerState = {
  fcmToken: '',
};
const metadata: StateMetadata<NotificationServicesPushControllerState> = {
  fcmToken: {
    persist: true,
    anonymous: true,
  },
};

type ControllerConfig = {
  /**
   * Config to turn on/off push notifications.
   * This is currently linked to MV3 builds on extension.
   */
  isPushEnabled: boolean;

  /**
   * Must handle when a push notification is received.
   * You must call `registration.showNotification` or equivalent to show the notification on web/mobile
   */
  onPushNotificationReceived: (
    notification: Types.INotification,
  ) => void | Promise<void>;

  /**
   * Must handle when a push notification is clicked.
   * You must call `event.notification.close();` or equivalent for closing and opening notification in a new window.
   */
  onPushNotificationClicked: (
    event: NotificationEvent,
    notification?: Types.INotification,
  ) => void;

  /**
   * determine the config used for push notification services
   */
  platform: 'extension' | 'mobile';
};

/**
 * Manages push notifications for the application, including enabling, disabling, and updating triggers for push notifications.
 * This controller integrates with Firebase Cloud Messaging (FCM) to handle the registration and management of push notifications.
 * It is responsible for registering and unregistering the service worker that listens for push notifications,
 * managing the FCM token, and communicating with the server to register or unregister the device for push notifications.
 * Additionally, it provides functionality to update the server with new UUIDs that should trigger push notifications.
 *
 * @augments {BaseController<typeof controllerName, NotificationServicesPushControllerState, NotificationServicesPushControllerMessenger>}
 */
export default class NotificationServicesPushController extends BaseController<
  typeof controllerName,
  NotificationServicesPushControllerState,
  NotificationServicesPushControllerMessenger
> {
  #pushListenerUnsubscribe: (() => void) | undefined = undefined;

  #env: PushNotificationEnv;

  #config: ControllerConfig;

  constructor({
    messenger,
    state,
    env,
    config,
  }: {
    messenger: NotificationServicesPushControllerMessenger;
    state: NotificationServicesPushControllerState;
    env: PushNotificationEnv;
    config: ControllerConfig;
  }) {
    super({
      messenger,
      metadata,
      name: controllerName,
      state: { ...defaultState, ...state },
    });

    this.#env = env;
    this.#config = config;

    this.#registerMessageHandlers();
  }

  #registerMessageHandlers(): void {
    this.messagingSystem.registerActionHandler(
      'NotificationServicesPushController:enablePushNotifications',
      this.enablePushNotifications.bind(this),
    );
    this.messagingSystem.registerActionHandler(
      'NotificationServicesPushController:disablePushNotifications',
      this.disablePushNotifications.bind(this),
    );
    this.messagingSystem.registerActionHandler(
      'NotificationServicesPushController:updateTriggerPushNotifications',
      this.updateTriggerPushNotifications.bind(this),
    );
    this.messagingSystem.registerActionHandler(
      'NotificationServicesPushController:subscribeToPushNotifications',
      this.subscribeToPushNotifications.bind(this),
    );
  }

  async #getAndAssertBearerToken() {
    const bearerToken = await this.messagingSystem.call(
      'AuthenticationController:getBearerToken',
    );
    if (!bearerToken) {
      log.error(
        'Failed to enable push notifications: BearerToken token is missing.',
      );
      throw new Error('BearerToken token is missing');
    }

    return bearerToken;
  }

  async subscribeToPushNotifications() {
    if (this.#pushListenerUnsubscribe) {
      this.#pushListenerUnsubscribe();
      this.#pushListenerUnsubscribe = undefined;
    }

    try {
      this.#pushListenerUnsubscribe = await listenToPushNotifications({
        env: this.#env,
        listenToPushReceived: async (n) => {
          this.messagingSystem.publish(
            'NotificationServicesPushController:onNewNotifications',
            n,
          );
          await this.#config.onPushNotificationReceived(n);
        },
        listenToPushClicked: (e, n) => {
          if (n) {
            this.messagingSystem.publish(
              'NotificationServicesPushController:pushNotificationClicked',
              n,
            );
          }

          this.#config.onPushNotificationClicked(e, n);
        },
      });
    } catch (e) {
      // Do nothing, we are silently failing if push notification registration fails
    }
  }

  /**
   * Enables push notifications for the application.
   *
   * This method sets up the necessary infrastructure for handling push notifications by:
   * 1. Registering the service worker to listen for messages.
   * 2. Fetching the Firebase Cloud Messaging (FCM) token from Firebase.
   * 3. Sending the FCM token to the server responsible for sending notifications, to register the device.
   *
   * @param UUIDs - An array of UUIDs to enable push notifications for.
   * @param fcmToken - The optional FCM token to use for push notifications.
   */
  async enablePushNotifications(UUIDs: string[], fcmToken?: string) {
    if (!this.#config.isPushEnabled) {
      return;
    }

    // Handle creating new reg token (if available)
    try {
      const bearerToken = await this.#getAndAssertBearerToken().catch(
        () => null,
      );

      // If there is a bearer token, lets try to refresh/create new reg token
      if (bearerToken) {
        // Activate Push Notifications
        const regToken = await activatePushNotifications({
          bearerToken,
          triggers: UUIDs,
          env: this.#env,
          fcmToken,
          createRegToken,
          platform: this.#config.platform,
        }).catch(() => null);

        if (regToken) {
          this.update((state) => {
            state.fcmToken = regToken;
          });
        }
      }
    } catch {
      // Do nothing, we are silently failing
    }

    // New token created, (re)subscribe to push notifications
    await this.subscribeToPushNotifications();
  }

  /**
   * Disables push notifications for the application.
   * This method handles the process of disabling push notifications by:
   * 1. Unregistering the service worker to stop listening for messages.
   * 2. Sending a request to the server to unregister the device using the FCM token.
   * 3. Removing the FCM token from the state to complete the process.
   *
   * @param UUIDs - An array of UUIDs for which push notifications should be disabled.
   */
  async disablePushNotifications(UUIDs: string[]) {
    if (!this.#config.isPushEnabled) {
      return;
    }

    const bearerToken = await this.#getAndAssertBearerToken();
    let isPushNotificationsDisabled: boolean;

    try {
      // Send a request to the server to unregister the token/device
      isPushNotificationsDisabled = await deactivatePushNotifications({
        bearerToken,
        triggers: UUIDs,
        env: this.#env,
        deleteRegToken,
        regToken: this.state.fcmToken,
      });
    } catch (error) {
      const errorMessage = `Failed to disable push notifications: ${
        error as string
      }`;
      log.error(errorMessage);
      throw new Error(errorMessage);
    }

    // Remove the FCM token from the state
    if (!isPushNotificationsDisabled) {
      return;
    }

    // Unsubscribe from push notifications
    this.#pushListenerUnsubscribe?.();

    // Update State
    if (isPushNotificationsDisabled) {
      this.update((state) => {
        state.fcmToken = '';
      });
    }
  }

  /**
   * Updates the triggers for push notifications.
   * This method is responsible for updating the server with the new set of UUIDs that should trigger push notifications.
   * It uses the current FCM token and a BearerToken for authentication.
   *
   * @param UUIDs - An array of UUIDs that should trigger push notifications.
   */
  async updateTriggerPushNotifications(UUIDs: string[]) {
    if (!this.#config.isPushEnabled) {
      return;
    }

    const bearerToken = await this.#getAndAssertBearerToken();

    try {
      const { fcmToken } = await updateTriggerPushNotifications({
        bearerToken,
        triggers: UUIDs,
        env: this.#env,
        createRegToken,
        deleteRegToken,
        platform: this.#config.platform,
        regToken: this.state.fcmToken,
      });

      // update the state with the new FCM token
      if (fcmToken) {
        this.update((state) => {
          state.fcmToken = fcmToken;
        });
      }
    } catch (error) {
      const errorMessage = `Failed to update triggers for push notifications: ${
        error as string
      }`;
      log.error(errorMessage);
      throw new Error(errorMessage);
    }
  }
}
