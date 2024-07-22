import type { RestrictedControllerMessenger } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { HandleSnapRequest } from '@metamask/snaps-controllers';
import type { AuthenticationControllerGetBearerToken, AuthenticationControllerGetSessionProfile, AuthenticationControllerIsSignedIn, AuthenticationControllerPerformSignIn, AuthenticationControllerPerformSignOut } from '../authentication/AuthenticationController';
import type { UserStoragePath } from './schema';
export declare type NotificationServicesControllerDisableNotificationServices = {
    type: `NotificationServicesController:disableNotificationServices`;
    handler: () => Promise<void>;
};
export declare type NotificationServicesControllerSelectIsNotificationServicesEnabled = {
    type: `NotificationServicesController:selectIsNotificationServicesEnabled`;
    handler: () => boolean;
};
declare const controllerName = "UserStorageController";
export type UserStorageControllerState = {
    /**
     * Condition used by UI and to determine if we can use some of the User Storage methods.
     */
    isProfileSyncingEnabled: boolean;
    /**
     * Loading state for the profile syncing update
     */
    isProfileSyncingUpdateLoading: boolean;
};
export declare const defaultState: UserStorageControllerState;
type CreateActionsObj<Controller extends keyof UserStorageController> = {
    [K in Controller]: {
        type: `${typeof controllerName}:${K}`;
        handler: UserStorageController[K];
    };
};
type ActionsObj = CreateActionsObj<'performGetStorage' | 'performSetStorage' | 'getStorageKey' | 'enableProfileSyncing' | 'disableProfileSyncing'>;
export type Actions = ActionsObj[keyof ActionsObj];
export type UserStorageControllerPerformGetStorage = ActionsObj['performGetStorage'];
export type UserStorageControllerPerformSetStorage = ActionsObj['performSetStorage'];
export type UserStorageControllerGetStorageKey = ActionsObj['getStorageKey'];
export type UserStorageControllerEnableProfileSyncing = ActionsObj['enableProfileSyncing'];
export type UserStorageControllerDisableProfileSyncing = ActionsObj['disableProfileSyncing'];
export type AllowedActions = HandleSnapRequest | AuthenticationControllerGetBearerToken | AuthenticationControllerGetSessionProfile | AuthenticationControllerPerformSignIn | AuthenticationControllerIsSignedIn | AuthenticationControllerPerformSignOut | NotificationServicesControllerDisableNotificationServices | NotificationServicesControllerSelectIsNotificationServicesEnabled;
export type UserStorageControllerMessenger = RestrictedControllerMessenger<typeof controllerName, Actions | AllowedActions, never, AllowedActions['type'], never>;
/**
 * Reusable controller that allows any team to store synchronized data for a given user.
 * These can be settings shared cross MetaMask clients, or data we want to persist when uninstalling/reinstalling.
 *
 * NOTE:
 * - data stored on UserStorage is FULLY encrypted, with the only keys stored/managed on the client.
 * - No one can access this data unless they are have the SRP and are able to run the signing snap.
 */
export default class UserStorageController extends BaseController<typeof controllerName, UserStorageControllerState, UserStorageControllerMessenger> {
    #private;
    getMetaMetricsState: () => boolean;
    constructor(params: {
        messenger: UserStorageControllerMessenger;
        state?: UserStorageControllerState;
        getMetaMetricsState: () => boolean;
    });
    enableProfileSyncing(): Promise<void>;
    setIsProfileSyncingEnabled(isProfileSyncingEnabled: boolean): Promise<void>;
    disableProfileSyncing(): Promise<void>;
    /**
     * Allows retrieval of stored data. Data stored is string formatted.
     * Developers can extend the entry path and entry name through the `schema.ts` file.
     *
     * @param path - string in the form of `${feature}.${key}` that matches schema
     * @returns the decrypted string contents found from user storage (or null if not found)
     */
    performGetStorage(path: UserStoragePath): Promise<string | null>;
    /**
     * Allows storage of user data. Data stored must be string formatted.
     * Developers can extend the entry path and entry name through the `schema.ts` file.
     *
     * @param path - string in the form of `${feature}.${key}` that matches schema
     * @param value - The string data you want to store.
     * @returns nothing. NOTE that an error is thrown if fails to store data.
     */
    performSetStorage(path: UserStoragePath, value: string): Promise<void>;
    /**
     * Retrieves the storage key, for internal use only!
     *
     * @returns the storage key
     */
    getStorageKey(): Promise<string>;
}
export {};
//# sourceMappingURL=UserStorageController.d.ts.map