import type { RestrictedControllerMessenger, ControllerGetStateAction, ControllerStateChangeEvent } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { KeyringControllerGetAccountsAction, KeyringControllerStateChangeEvent } from '@metamask/keyring-controller';
import type { AuthenticationController, UserStorageController } from '@metamask/profile-sync-controller';
import type { INotification, MarkAsReadNotificationsParam } from './types/notification/notification';
import type { UserStorage } from './types/user-storage/user-storage';
export type NotificationServicesPushControllerEnablePushNotifications = {
    type: `NotificationServicesPushController:enablePushNotifications`;
    handler: (UUIDs: string[]) => Promise<void>;
};
export type NotificationServicesPushControllerDisablePushNotifications = {
    type: `NotificationServicesPushController:disablePushNotifications`;
    handler: (UUIDs: string[]) => Promise<void>;
};
export type NotificationServicesPushControllerUpdateTriggerPushNotifications = {
    type: `NotificationServicesPushController:updateTriggerPushNotifications`;
    handler: (UUIDs: string[]) => Promise<void>;
};
export type NotificationServicesPushControllerOnNewNotification = {
    type: `NotificationServicesPushController:onNewNotifications`;
    payload: [INotification];
};
declare const controllerName = "NotificationServicesController";
/**
 * State shape for NotificationServicesController
 */
export type NotificationServicesControllerState = {
    /**
     * We store and manage accounts that have been seen/visted through the
     * account subscription. This allows us to track and add notifications for new accounts and not previous accounts added.
     */
    subscriptionAccountsSeen: string[];
    /**
     * Flag that indicates if the metamask notifications feature has been seen
     */
    isMetamaskNotificationsFeatureSeen: boolean;
    /**
     * Flag that indicates if the metamask notifications are enabled
     */
    isNotificationServicesEnabled: boolean;
    /**
     * Flag that indicates if the feature announcements are enabled
     */
    isFeatureAnnouncementsEnabled: boolean;
    /**
     * List of metamask notifications
     */
    metamaskNotificationsList: INotification[];
    /**
     * List of read metamask notifications
     */
    metamaskNotificationsReadList: string[];
    /**
     * Flag that indicates that the creating notifications is in progress
     */
    isUpdatingMetamaskNotifications: boolean;
    /**
     * Flag that indicates that the fetching notifications is in progress
     * This is used to show a loading spinner in the UI
     * when fetching notifications
     */
    isFetchingMetamaskNotifications: boolean;
    /**
     * Flag that indicates that the updating notifications for a specific address is in progress
     */
    isUpdatingMetamaskNotificationsAccount: string[];
    /**
     * Flag that indicates that the checking accounts presence is in progress
     */
    isCheckingAccountsPresence: boolean;
};
export declare const defaultState: NotificationServicesControllerState;
export type NotificationServicesControllerUpdateMetamaskNotificationsList = {
    type: `${typeof controllerName}:updateMetamaskNotificationsList`;
    handler: NotificationServicesController['updateMetamaskNotificationsList'];
};
export type NotificationServicesControllerDisableNotificationServices = {
    type: `${typeof controllerName}:disableNotificationServices`;
    handler: NotificationServicesController['disableNotificationServices'];
};
export type NotificationServicesControllerSelectIsNotificationServicesEnabled = {
    type: `${typeof controllerName}:selectIsNotificationServicesEnabled`;
    handler: NotificationServicesController['selectIsNotificationServicesEnabled'];
};
export type Actions = NotificationServicesControllerUpdateMetamaskNotificationsList | NotificationServicesControllerDisableNotificationServices | NotificationServicesControllerSelectIsNotificationServicesEnabled | ControllerGetStateAction<'state', NotificationServicesControllerState>;
export type AllowedActions = KeyringControllerGetAccountsAction | AuthenticationController.AuthenticationControllerGetBearerToken | AuthenticationController.AuthenticationControllerIsSignedIn | UserStorageController.UserStorageControllerEnableProfileSyncing | UserStorageController.UserStorageControllerGetStorageKey | UserStorageController.UserStorageControllerPerformGetStorage | UserStorageController.UserStorageControllerPerformSetStorage | NotificationServicesPushControllerEnablePushNotifications | NotificationServicesPushControllerDisablePushNotifications | NotificationServicesPushControllerUpdateTriggerPushNotifications;
export type NotificationServicesControllerMessengerEvents = ControllerStateChangeEvent<typeof controllerName, NotificationServicesControllerState>;
export type AllowedEvents = KeyringControllerStateChangeEvent | NotificationServicesPushControllerOnNewNotification;
export type NotificationServicesControllerMessenger = RestrictedControllerMessenger<typeof controllerName, Actions | AllowedActions, AllowedEvents, AllowedActions['type'], AllowedEvents['type']>;
type FeatureAnnouncementEnv = {
    spaceId: string;
    accessToken: string;
    platform: 'extension' | 'mobile';
};
/**
 * Controller that enables wallet notifications and feature announcements
 */
export default class NotificationServicesController extends BaseController<typeof controllerName, NotificationServicesControllerState, NotificationServicesControllerMessenger> {
    #private;
    /**
     * Creates a NotificationServicesController instance.
     *
     * @param args - The arguments to this function.
     * @param args.messenger - Messenger used to communicate with BaseV2 controller.
     * @param args.state - Initial state to set on this controller.
     * @param args.env - environment variables for a given controller.
     * @param args.env.featureAnnouncements - env variables for feature announcements.
     * @param args.env.isPushIntegrated - toggle push notifications on/off if client has integrated them.
     */
    constructor({ messenger, state, env, }: {
        messenger: NotificationServicesControllerMessenger;
        state?: Partial<NotificationServicesControllerState>;
        env: {
            featureAnnouncements: FeatureAnnouncementEnv;
            isPushIntegrated?: boolean;
        };
    });
    /**
     * Retrieves the current enabled state of MetaMask notifications.
     *
     * This method directly returns the boolean value of `isMetamaskNotificationsEnabled`
     * from the controller's state, indicating whether MetaMask notifications are currently enabled.
     *
     * @returns The enabled state of MetaMask notifications.
     */
    selectIsNotificationServicesEnabled(): boolean;
    checkAccountsPresence(accounts: string[]): Promise<Record<string, boolean>>;
    /**
     * Sets the enabled state of feature announcements.
     *
     * **Action** - used in the notification settings to enable/disable feature announcements.
     *
     * @param featureAnnouncementsEnabled - A boolean value indicating the desired enabled state of the feature announcements.
     * @async
     * @throws {Error} If fails to update
     */
    setFeatureAnnouncementsEnabled(featureAnnouncementsEnabled: boolean): Promise<void>;
    /**
     * This creates/re-creates on-chain triggers defined in User Storage.
     *
     * **Action** - Used during Sign In / Enabling of notifications.
     *
     * @returns The updated or newly created user storage.
     * @throws {Error} Throws an error if unauthenticated or from other operations.
     */
    createOnChainTriggers(): Promise<UserStorage>;
    /**
     * Enables all MetaMask notifications for the user.
     * This is identical flow when initializing notifications for the first time.
     * 1. Enable Profile Syncing
     * 2. Get or Create Notification User Storage
     * 3. Upsert Triggers
     * 4. Update Push notifications
     *
     * @throws {Error} If there is an error during the process of enabling notifications.
     */
    enableMetamaskNotifications(): Promise<void>;
    /**
     * Disables all MetaMask notifications for the user.
     * This method ensures that the user is authenticated, retrieves all linked accounts,
     * and disables on-chain triggers for each account. It also sets the global notification
     * settings for MetaMask, feature announcements to false.
     *
     * @throws {Error} If the user is not authenticated or if there is an error during the process.
     */
    disableNotificationServices(): Promise<void>;
    /**
     * Deletes on-chain triggers associated with a specific account.
     * This method performs several key operations:
     * 1. Validates Auth & Storage
     * 2. Finds and deletes all triggers associated with the account
     * 3. Disables any related push notifications
     * 4. Updates Storage to reflect new state.
     *
     * **Action** - When a user disables notifications for a given account in settings.
     *
     * @param accounts - The account for which on-chain triggers are to be deleted.
     * @returns A promise that resolves to void or an object containing a success message.
     * @throws {Error} Throws an error if unauthenticated or from other operations.
     */
    deleteOnChainTriggersByAccount(accounts: string[]): Promise<UserStorage>;
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
    updateOnChainTriggersByAccount(accounts: string[]): Promise<UserStorage>;
    /**
     * Fetches the list of metamask notifications.
     * This includes OnChain notifications and Feature Announcements.
     *
     * **Action** - When a user views the notification list page/dropdown
     *
     * @throws {Error} Throws an error if unauthenticated or from other operations.
     */
    fetchAndUpdateMetamaskNotifications(): Promise<INotification[]>;
    /**
     * Marks specified metamask notifications as read.
     *
     * @param notifications - An array of notifications to be marked as read. Each notification should include its type and read status.
     * @returns A promise that resolves when the operation is complete.
     */
    markMetamaskNotificationsAsRead(notifications: MarkAsReadNotificationsParam): Promise<void>;
    /**
     * Updates the list of MetaMask notifications by adding a new notification at the beginning of the list.
     * This method ensures that the most recent notification is displayed first in the UI.
     *
     * @param notification - The new notification object to be added to the list.
     * @returns A promise that resolves when the notification list has been successfully updated.
     */
    updateMetamaskNotificationsList(notification: INotification): Promise<void>;
}
export {};
//# sourceMappingURL=NotificationServicesController.d.ts.map