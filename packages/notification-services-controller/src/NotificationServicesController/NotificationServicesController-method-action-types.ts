/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { NotificationServicesController } from './NotificationServicesController.js';

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
 * @deprecated Feature announcements follow marketing consent (the AUS
 * `marketing.inAppNotificationsEnabled` preference). Nothing in this
 * controller reads the flag this sets, and it will be removed.
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
 * Notification preferences are initialized only when
 * {@link AuthenticatedUserStorageService} has no stored preferences yet.
 * Existing preferences are left as-is.
 *
 * When preferences are initialized, both marketing channels (push, and
 * in-app feature announcements) follow `AnalyticsController` marketing
 * consent.
 *
 * @param opts - optional options to mutate this functionality
 * @param opts.hasMarketingConsent - Deprecated and ignored.
 * @param opts.productAnnouncementEnabled - Deprecated and ignored.
 * @param opts.registerPushNotifications - Whether to attempt FCM/device push registration.
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
 * @param opts - Optional options to mutate this functionality.
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
 * Disables wallet-activity subscriptions for the given accounts.
 *
 * This only writes the Trigger API. The device's FCM links stay in place,
 * because those links deliver every notification source for an address.
 *
 * **Action** - When a user disables wallet activity for a given account.
 *
 * @param accounts - The accounts whose wallet-activity subscriptions are disabled.
 * @throws {Error} Throws an error if unauthenticated or from other operations.
 */
export type NotificationServicesControllerDisableAccountsAction = {
  type: `NotificationServicesController:disableAccounts`;
  handler: NotificationServicesController['disableAccounts'];
};

/**
 * Enables wallet-activity subscriptions for the given accounts.
 *
 * This only writes the Trigger API. Linking the device token is handled
 * when the account is added or when notifications are enabled.
 *
 * **Action** - When a user enables wallet activity for an account.
 *
 * @param accounts - List of accounts to subscribe.
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
 * Saves a change to the user's notification preferences in Authenticated
 * User Storage. Sections and fields left out keep their stored value, so
 * callers send only what they change.
 *
 * Marketing notifications require marketing consent, so an update that
 * turns a marketing channel on while the user has not consented is
 * rejected. Only the fields in the update are checked: a marketing channel
 * already on in storage doesn't block updates to other preferences. Turning
 * consent off turns marketing channels off on its own (see
 * `MarketingConsentController`).
 *
 * Read preferences from `AuthenticatedUserStorageService:getNotificationPreferences`
 * (e.g. through `@metamask/react-data-query`), whose cache keeps UIs up to
 * date; write them through this method so the consent rule is enforced.
 *
 * @param update - The sections and fields to change.
 * @returns The saved preferences.
 * @throws {MarketingConsentRequiredError} If the update turns a marketing
 * channel on without marketing consent.
 * @throws If notification preferences have not been set up yet; they are
 * created when notifications are first enabled.
 */
export type NotificationServicesControllerUpdateNotificationPreferencesAction =
  {
    type: `NotificationServicesController:updateNotificationPreferences`;
    handler: NotificationServicesController['updateNotificationPreferences'];
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
  | NotificationServicesControllerSendPerpPlaceOrderNotificationAction
  | NotificationServicesControllerUpdateNotificationPreferencesAction;
