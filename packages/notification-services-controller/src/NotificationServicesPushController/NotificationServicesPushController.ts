import type {
  RestrictedMessenger,
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { AuthenticationController } from '@metamask/profile-sync-controller';
import log from 'loglevel';

import {
  activatePushNotifications,
  deactivatePushNotifications,
  updateTriggerPushNotifications,
} from './services/services';
import type { PushNotificationEnv } from './types';
import type { PushService } from './types/push-service-interface';
import type { Types } from '../NotificationServicesController';

const controllerName = 'NotificationServicesPushController';

export type NotificationServicesPushControllerState = {
  isPushEnabled: boolean;
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

export type NotificationServicesPushControllerMessenger = RestrictedMessenger<
  typeof controllerName,
  Actions | AllowedActions,
  Events | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

export const defaultState: NotificationServicesPushControllerState = {
  isPushEnabled: true,
  fcmToken: '',
};
const metadata: StateMetadata<NotificationServicesPushControllerState> = {
  isPushEnabled: {
    persist: true,
    anonymous: true,
  },
  fcmToken: {
    persist: true,
    anonymous: true,
  },
};

const defaultPushEnv: PushNotificationEnv = {
  apiKey: '',
  authDomain: '',
  storageBucket: '',
  projectId: '',
  messagingSenderId: '',
  appId: '',
  measurementId: '',
  vapidKey: '',
};

export type ControllerConfig = {
  /**
   * Global switch to determine to use push notifications
   * Allows us to control Builds on extension (MV2 vs MV3)
   */
  isPushFeatureEnabled?: boolean;

  /**
   * determine the config used for push notification services
   */
  platform: 'extension' | 'mobile';

  /**
   * Push Service Interface
   * - create reg token
   * - delete reg token
   * - subscribe to push notifications
   */
  pushService: PushService;
};

type StateCommand =
  | { type: 'enable'; fcmToken: string }
  | { type: 'disable' }
  | { type: 'update'; fcmToken: string };

/**
 * Manages push notifications for the application, including enabling, disabling, and updating triggers for push notifications.
 * This controller integrates with Firebase Cloud Messaging (FCM) to handle the registration and management of push notifications.
 * It is responsible for registering and unregistering the service worker that listens for push notifications,
 * managing the FCM token, and communicating with the server to register or unregister the device for push notifications.
 * Additionally, it provides functionality to update the server with new UUIDs that should trigger push notifications.
 */
export default class NotificationServicesPushController extends BaseController<
  typeof controllerName,
  NotificationServicesPushControllerState,
  NotificationServicesPushControllerMessenger
> {
  #pushListenerUnsubscribe: (() => void) | undefined = undefined;

  readonly #env: PushNotificationEnv;

  readonly #config: ControllerConfig;

  constructor({
    messenger,
    state,
    env,
    config,
  }: {
    messenger: NotificationServicesPushControllerMessenger;
    state: NotificationServicesPushControllerState;
    /** Push Environment is only required for extension */
    env?: PushNotificationEnv;
    config: ControllerConfig;
  }) {
    super({
      messenger,
      metadata,
      name: controllerName,
      state: { ...defaultState, ...state },
    });

    this.#env = env ?? defaultPushEnv;
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

  updatePushState(command: StateCommand) {
    if (command.type === 'enable') {
      this.update((state) => {
        state.isPushEnabled = true;
        state.fcmToken = command.fcmToken;
      });
    }

    if (command.type === 'disable') {
      this.update((state) => {
        state.isPushEnabled = false;
        state.fcmToken = '';
      });
    }

    if (command.type === 'update') {
      this.update((state) => {
        state.isPushEnabled = true;
        state.fcmToken = command.fcmToken;
      });
    }
  }

  async subscribeToPushNotifications() {
    if (!this.#config.isPushFeatureEnabled) {
      return;
    }

    if (this.#pushListenerUnsubscribe) {
      this.#pushListenerUnsubscribe();
      this.#pushListenerUnsubscribe = undefined;
    }

    try {
      this.#pushListenerUnsubscribe =
        (await this.#config.pushService.subscribeToPushNotifications(
          this.#env,
        )) ?? undefined;
    } catch {
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
   */
  async enablePushNotifications(UUIDs: string[]) {
    if (!this.#config.isPushFeatureEnabled) {
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
        const fcmToken = await activatePushNotifications({
          bearerToken,
          triggers: UUIDs,
          env: this.#env,
          createRegToken: this.#config.pushService.createRegToken,
          platform: this.#config.platform,
        }).catch(() => null);

        if (fcmToken) {
          this.updatePushState({ type: 'enable', fcmToken });
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
   * This removes the registration token on this device, and ensures we unsubscribe from any listeners
   */
  async disablePushNotifications() {
    if (!this.#config.isPushFeatureEnabled) {
      return;
    }

    try {
      // Send a request to the server to unregister the token/device
      await deactivatePushNotifications({
        env: this.#env,
        deleteRegToken: this.#config.pushService.deleteRegToken,
        regToken: this.state.fcmToken,
      });
    } catch (error) {
      const errorMessage = `Failed to disable push notifications: ${
        error as string
      }`;
      log.error(errorMessage);
      throw new Error(errorMessage);
    }

    // Unsubscribe from push notifications
    this.#pushListenerUnsubscribe?.();

    // Update State
    this.updatePushState({ type: 'disable' });
  }

  /**
   * Updates the triggers for push notifications.
   * This method is responsible for updating the server with the new set of UUIDs that should trigger push notifications.
   * It uses the current FCM token and a BearerToken for authentication.
   *
   * @param UUIDs - An array of UUIDs that should trigger push notifications.
   */
  async updateTriggerPushNotifications(UUIDs: string[]) {
    if (!this.#config.isPushFeatureEnabled) {
      return;
    }

    const bearerToken = await this.#getAndAssertBearerToken();

    try {
      const { fcmToken } = await updateTriggerPushNotifications({
        bearerToken,
        triggers: UUIDs,
        env: this.#env,
        createRegToken: this.#config.pushService.createRegToken,
        deleteRegToken: this.#config.pushService.deleteRegToken,
        platform: this.#config.platform,
      });

      // update the state with the new FCM token
      if (fcmToken) {
        this.updatePushState({ type: 'update', fcmToken });
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
