import type { RestrictedControllerMessenger, ControllerGetStateAction } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { AuthenticationController } from '@metamask/profile-sync-controller';
import type { Types } from '../NotificationServicesController';
import type { PushNotificationEnv } from './types';
declare const controllerName = "NotificationServicesPushController";
export type NotificationServicesPushControllerState = {
    fcmToken: string;
};
export type NotificationServicesPushControllerEnablePushNotificationsAction = {
    type: `${typeof controllerName}:enablePushNotifications`;
    handler: NotificationServicesPushController['enablePushNotifications'];
};
export type NotificationServicesPushControllerDisablePushNotificationsAction = {
    type: `${typeof controllerName}:disablePushNotifications`;
    handler: NotificationServicesPushController['disablePushNotifications'];
};
export type NotificationServicesPushControllerUpdateTriggerPushNotificationsAction = {
    type: `${typeof controllerName}:updateTriggerPushNotifications`;
    handler: NotificationServicesPushController['updateTriggerPushNotifications'];
};
export type Actions = NotificationServicesPushControllerEnablePushNotificationsAction | NotificationServicesPushControllerDisablePushNotificationsAction | NotificationServicesPushControllerUpdateTriggerPushNotificationsAction | ControllerGetStateAction<'state', NotificationServicesPushControllerState>;
export type AllowedActions = AuthenticationController.AuthenticationControllerGetBearerToken;
export type NotificationServicesPushControllerOnNewNotificationEvent = {
    type: `${typeof controllerName}:onNewNotifications`;
    payload: [Types.INotification];
};
export type NotificationServicesPushControllerPushNotificationClicked = {
    type: `${typeof controllerName}:pushNotificationClicked`;
    payload: [Types.INotification];
};
export type AllowedEvents = NotificationServicesPushControllerOnNewNotificationEvent | NotificationServicesPushControllerPushNotificationClicked;
export type NotificationServicesPushControllerMessenger = RestrictedControllerMessenger<typeof controllerName, Actions | AllowedActions, AllowedEvents, AllowedActions['type'], AllowedEvents['type']>;
export declare const defaultState: NotificationServicesPushControllerState;
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
    onPushNotificationReceived: (notification: Types.INotification) => void | Promise<void>;
    /**
     * Must handle when a push notification is clicked.
     * You must call `event.notification.close();` or equivalent for closing and opening notification in a new window.
     */
    onPushNotificationClicked: (event: NotificationEvent, notification?: Types.INotification) => void;
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
export default class NotificationServicesPushController extends BaseController<typeof controllerName, NotificationServicesPushControllerState, NotificationServicesPushControllerMessenger> {
    #private;
    constructor({ messenger, state, env, config, }: {
        messenger: NotificationServicesPushControllerMessenger;
        state: NotificationServicesPushControllerState;
        env: PushNotificationEnv;
        config: ControllerConfig;
    });
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
    enablePushNotifications(UUIDs: string[]): Promise<void>;
    /**
     * Disables push notifications for the application.
     * This method handles the process of disabling push notifications by:
     * 1. Unregistering the service worker to stop listening for messages.
     * 2. Sending a request to the server to unregister the device using the FCM token.
     * 3. Removing the FCM token from the state to complete the process.
     *
     * @param UUIDs - An array of UUIDs for which push notifications should be disabled.
     */
    disablePushNotifications(UUIDs: string[]): Promise<void>;
    /**
     * Updates the triggers for push notifications.
     * This method is responsible for updating the server with the new set of UUIDs that should trigger push notifications.
     * It uses the current FCM token and a BearerToken for authentication.
     *
     * @param UUIDs - An array of UUIDs that should trigger push notifications.
     */
    updateTriggerPushNotifications(UUIDs: string[]): Promise<void>;
}
export {};
//# sourceMappingURL=NotificationServicesPushController.d.ts.map