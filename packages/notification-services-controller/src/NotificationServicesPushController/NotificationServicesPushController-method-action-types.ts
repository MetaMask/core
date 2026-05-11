/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { NotificationServicesPushController } from './NotificationServicesPushController';

export type NotificationServicesPushControllerSubscribeToPushNotificationsAction =
  {
    type: `NotificationServicesPushController:subscribeToPushNotifications`;
    handler: NotificationServicesPushController['subscribeToPushNotifications'];
  };

/**
 * Enables push notifications for the application.
 *
 * This method sets up the necessary infrastructure for handling push notifications by:
 * 1. Registering the service worker to listen for messages.
 * 2. Fetching the Firebase Cloud Messaging (FCM) token from Firebase.
 * 3. Sending the FCM token to the server responsible for sending notifications, to register the device.
 *
 * @param addresses - An array of addresses to enable push notifications for.
 */
export type NotificationServicesPushControllerEnablePushNotificationsAction = {
  type: `NotificationServicesPushController:enablePushNotifications`;
  handler: NotificationServicesPushController['enablePushNotifications'];
};

/**
 * Disables push notifications for the application.
 * This removes the registration token on this device, and ensures we unsubscribe from any listeners
 */
export type NotificationServicesPushControllerDisablePushNotificationsAction = {
  type: `NotificationServicesPushController:disablePushNotifications`;
  handler: NotificationServicesPushController['disablePushNotifications'];
};

/**
 * Adds backend push notification links for the given addresses using the current FCM token.
 * This is used when accounts are added after push notifications have already been enabled,
 * so backend can link the existing device token to the newly added addresses.
 *
 * @param addresses - Addresses that should be linked to push notifications.
 * @returns Whether the add request succeeded.
 */
export type NotificationServicesPushControllerAddPushNotificationLinksAction = {
  type: `NotificationServicesPushController:addPushNotificationLinks`;
  handler: NotificationServicesPushController['addPushNotificationLinks'];
};

/**
 * Deletes backend push notification links for the given addresses on the current platform.
 * This is used when accounts are removed (for example SRP removal), so backend can remove
 * all associated FCM tokens for those address/platform pairs.
 *
 * @param addresses - Addresses that should be unlinked from push notifications.
 * @returns Whether the delete request succeeded.
 */
export type NotificationServicesPushControllerDeletePushNotificationLinksAction =
  {
    type: `NotificationServicesPushController:deletePushNotificationLinks`;
    handler: NotificationServicesPushController['deletePushNotificationLinks'];
  };

/**
 * Updates the triggers for push notifications.
 * This method is responsible for updating the server with the new set of addresses that should trigger push notifications.
 * It uses the current FCM token and a BearerToken for authentication.
 *
 * @param addresses - An array of addresses that should trigger push notifications.
 * @deprecated - this is not used anymore and will most likely be removed
 */
export type NotificationServicesPushControllerUpdateTriggerPushNotificationsAction =
  {
    type: `NotificationServicesPushController:updateTriggerPushNotifications`;
    handler: NotificationServicesPushController['updateTriggerPushNotifications'];
  };

/**
 * Union of all NotificationServicesPushController action types.
 */
export type NotificationServicesPushControllerMethodActions =
  | NotificationServicesPushControllerSubscribeToPushNotificationsAction
  | NotificationServicesPushControllerEnablePushNotificationsAction
  | NotificationServicesPushControllerDisablePushNotificationsAction
  | NotificationServicesPushControllerAddPushNotificationLinksAction
  | NotificationServicesPushControllerDeletePushNotificationLinksAction
  | NotificationServicesPushControllerUpdateTriggerPushNotificationsAction;
