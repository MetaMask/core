/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { NotificationServicesController } from './NotificationServicesController';

export type NotificationServicesControllerInitAction = {
  type: `NotificationServicesController:init`;
  handler: NotificationServicesController['init'];
};

/**
 * Public method to expose enabling push notifications
 */
export type NotificationServicesControllerEnablePushNotificationsAction = {
  type: `NotificationServicesController:enablePushNotifications`;
  handler: NotificationServicesController['enablePushNotifications'];
};

/**
 * Public method to expose disabling push notifications
 */
export type NotificationServicesControllerDisablePushNotificationsAction = {
  type: `NotificationServicesController:disablePushNotifications`;
  handler: NotificationServicesController['disablePushNotifications'];
};

export type NotificationServicesControllerCheckAccountsPresenceAction = {
  type: `NotificationServicesController:checkAccountsPresence`;
  handler: NotificationServicesController['checkAccountsPresence'];
};

/**
 * Sets the enabled state of feature announcements.
 *
 * **Action** - used in the notification settings to enable/disable feature announcements.
 *
 * @param featureAnnouncementsEnabled - A boolean value indicating the desired enabled state of the feature announcements.
 * @async
 * @throws {Error} If fails to update
 */
export type NotificationServicesControllerSetFeatureAnnouncementsEnabledAction =
  {
    type: `NotificationServicesController:setFeatureAnnouncementsEnabled`;
    handler: NotificationServicesController['setFeatureAnnouncementsEnabled'];
  };

/**
 * This creates/re-creates on-chain triggers defined in User Storage.
 *
 * **Action** - Used during Sign In / Enabling of notifications.
 *
 * @param opts - optional options to mutate this functionality
 * @param opts.resetNotifications - this will not use the users stored preferences, and instead re-create notification triggers
 * It will help in case uses get into a corrupted state or wants to wipe their notifications.
 * @returns The updated or newly created user storage.
 * @throws {Error} Throws an error if unauthenticated or from other operations.
 */
export type NotificationServicesControllerCreateOnChainTriggersAction = {
  type: `NotificationServicesController:createOnChainTriggers`;
  handler: NotificationServicesController['createOnChainTriggers'];
};

/**
 * Enables all MetaMask notifications for the user.
 * This is identical flow when initializing notifications for the first time.
 *
 * @throws {Error} If there is an error during the process of enabling notifications.
 */
export type NotificationServicesControllerEnableMetamaskNotificationsAction = {
  type: `NotificationServicesController:enableMetamaskNotifications`;
  handler: NotificationServicesController['enableMetamaskNotifications'];
};

/**
 * Disables all MetaMask notifications for the user.
 * This method ensures that the user is authenticated, retrieves all linked accounts,
 * and disables on-chain triggers for each account. It also sets the global notification
 * settings for MetaMask, feature announcements to false.
 *
 * @throws {Error} If the user is not authenticated or if there is an error during the process.
 */
export type NotificationServicesControllerDisableNotificationServicesAction = {
  type: `NotificationServicesController:disableNotificationServices`;
  handler: NotificationServicesController['disableNotificationServices'];
};

/**
 * Deletes on-chain triggers associated with a specific account/s.
 * This method performs several key operations:
 * 1. Validates Auth
 * 2. Deletes accounts
 * (note) We do not need to look through push notifications as we've deleted triggers
 *
 * **Action** - When a user disables notifications for a given account in settings.
 *
 * @param accounts - The account for which on-chain triggers are to be deleted.
 * @returns A promise that resolves to void or an object containing a success message.
 * @throws {Error} Throws an error if unauthenticated or from other operations.
 */
export type NotificationServicesControllerDisableAccountsAction = {
  type: `NotificationServicesController:disableAccounts`;
  handler: NotificationServicesController['disableAccounts'];
};

/**
 * Updates/Creates on-chain triggers for a specific account.
 *
 * This method performs several key operations:
 * 1. Validates Auth & Storage
 * 2. Finds and creates any missing triggers associated with the account
 * 3. Enables any related push notifications
 * 4. Updates Storage to reflect new state.
 *
 * **Action** - When a user enables notifications for an account
 *
 * @param accounts - List of accounts you want to update.
 * @returns A promise that resolves to the updated user storage.
 * @throws {Error} Throws an error if unauthenticated or from other operations.
 */
export type NotificationServicesControllerEnableAccountsAction = {
  type: `NotificationServicesController:enableAccounts`;
  handler: NotificationServicesController['enableAccounts'];
};

/**
 * Fetches the list of metamask notifications.
 * This includes OnChain notifications; Feature Announcements; and Snap Notifications.
 *
 * **Action** - When a user views the notification list page/dropdown
 *
 * @param previewToken - the preview token to use if needed
 * @returns A promise that resolves to the list of notifications.
 * @throws {Error} Throws an error if unauthenticated or from other operations.
 */
export type NotificationServicesControllerFetchAndUpdateMetamaskNotificationsAction =
  {
    type: `NotificationServicesController:fetchAndUpdateMetamaskNotifications`;
    handler: NotificationServicesController['fetchAndUpdateMetamaskNotifications'];
  };

/**
 * Gets the specified type of notifications from state.
 *
 * @param type - The trigger type.
 * @returns An array of notifications of the passed in type.
 * @throws Throws an error if an invalid trigger type is passed.
 */
export type NotificationServicesControllerGetNotificationsByTypeAction = {
  type: `NotificationServicesController:getNotificationsByType`;
  handler: NotificationServicesController['getNotificationsByType'];
};

/**
 * Used to delete a notification by id.
 *
 * Note: This function should only be used for notifications that are stored
 * in this controller directly, currently only snaps notifications.
 *
 * @param id - The id of the notification to delete.
 */
export type NotificationServicesControllerDeleteNotificationByIdAction = {
  type: `NotificationServicesController:deleteNotificationById`;
  handler: NotificationServicesController['deleteNotificationById'];
};

/**
 * Used to batch delete notifications by id.
 *
 * Note: This function should only be used for notifications that are stored
 * in this controller directly, currently only snaps notifications.
 *
 * @param ids - The ids of the notifications to delete.
 */
export type NotificationServicesControllerDeleteNotificationsByIdAction = {
  type: `NotificationServicesController:deleteNotificationsById`;
  handler: NotificationServicesController['deleteNotificationsById'];
};

/**
 * Marks specified metamask notifications as read.
 *
 * @param notifications - An array of notifications to be marked as read. Each notification should include its type and read status.
 * @returns A promise that resolves when the operation is complete.
 */
export type NotificationServicesControllerMarkMetamaskNotificationsAsReadAction =
  {
    type: `NotificationServicesController:markMetamaskNotificationsAsRead`;
    handler: NotificationServicesController['markMetamaskNotificationsAsRead'];
  };

/**
 * Updates the list of MetaMask notifications by adding a new notification at the beginning of the list.
 * This method ensures that the most recent notification is displayed first in the UI.
 *
 * @param notification - The new notification object to be added to the list.
 * @returns A promise that resolves when the notification list has been successfully updated.
 */
export type NotificationServicesControllerUpdateMetamaskNotificationsListAction =
  {
    type: `NotificationServicesController:updateMetamaskNotificationsList`;
    handler: NotificationServicesController['updateMetamaskNotificationsList'];
  };

/**
 * Creates an perp order notification subscription.
 * Requires notifications and auth to be enabled to start receiving this notifications
 *
 * @param input perp input
 */
export type NotificationServicesControllerSendPerpPlaceOrderNotificationAction =
  {
    type: `NotificationServicesController:sendPerpPlaceOrderNotification`;
    handler: NotificationServicesController['sendPerpPlaceOrderNotification'];
  };

/**
 * Union of all NotificationServicesController action types.
 */
export type NotificationServicesControllerMethodActions =
  | NotificationServicesControllerInitAction
  | NotificationServicesControllerEnablePushNotificationsAction
  | NotificationServicesControllerDisablePushNotificationsAction
  | NotificationServicesControllerCheckAccountsPresenceAction
  | NotificationServicesControllerSetFeatureAnnouncementsEnabledAction
  | NotificationServicesControllerCreateOnChainTriggersAction
  | NotificationServicesControllerEnableMetamaskNotificationsAction
  | NotificationServicesControllerDisableNotificationServicesAction
  | NotificationServicesControllerDisableAccountsAction
  | NotificationServicesControllerEnableAccountsAction
  | NotificationServicesControllerFetchAndUpdateMetamaskNotificationsAction
  | NotificationServicesControllerGetNotificationsByTypeAction
  | NotificationServicesControllerDeleteNotificationByIdAction
  | NotificationServicesControllerDeleteNotificationsByIdAction
  | NotificationServicesControllerMarkMetamaskNotificationsAsReadAction
  | NotificationServicesControllerUpdateMetamaskNotificationsListAction
  | NotificationServicesControllerSendPerpPlaceOrderNotificationAction;
