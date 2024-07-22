import type { Types } from '../../NotificationServicesController';
import type { PushNotificationEnv } from '../types';
import type { CreateRegToken, DeleteRegToken } from './push';
export type RegToken = {
    token: string;
    platform: 'extension' | 'mobile' | 'portfolio';
};
/**
 * Links API Response Shape
 */
export type LinksResult = {
    trigger_ids: string[];
    registration_tokens: RegToken[];
};
/**
 * Fetches push notification links from a remote endpoint using a BearerToken for authorization.
 *
 * @param bearerToken - The JSON Web Token used for authorization.
 * @returns A promise that resolves with the links result or null if an error occurs.
 */
export declare function getPushNotificationLinks(bearerToken: string): Promise<LinksResult | null>;
/**
 * Updates the push notification links on a remote API.
 *
 * @param bearerToken - The JSON Web Token used for authorization.
 * @param triggers - An array of trigger identifiers.
 * @param regTokens - An array of registration tokens.
 * @returns A promise that resolves with true if the update was successful, false otherwise.
 */
export declare function updateLinksAPI(bearerToken: string, triggers: string[], regTokens: RegToken[]): Promise<boolean>;
type ActivatePushNotificationsParams = {
    bearerToken: string;
    triggers: string[];
    env: PushNotificationEnv;
    createRegToken: CreateRegToken;
    platform: 'extension' | 'mobile' | 'portfolio';
};
/**
 * Enables push notifications by registering the device and linking triggers.
 *
 * @param params - Activate Push Params
 * @returns A promise that resolves with an object containing the success status and the BearerToken token.
 */
export declare function activatePushNotifications(params: ActivatePushNotificationsParams): Promise<string | null>;
type DeactivatePushNotificationsParams = {
    regToken: string;
    bearerToken: string;
    triggers: string[];
    env: PushNotificationEnv;
    deleteRegToken: DeleteRegToken;
};
/**
 * Disables push notifications by removing the registration token and unlinking triggers.
 *
 * @param params - Deactivate Push Params
 * @returns A promise that resolves with true if notifications were successfully disabled, false otherwise.
 */
export declare function deactivatePushNotifications(params: DeactivatePushNotificationsParams): Promise<boolean>;
type UpdateTriggerPushNotificationsParams = {
    regToken: string;
    bearerToken: string;
    triggers: string[];
    env: PushNotificationEnv;
    createRegToken: CreateRegToken;
    platform: 'extension' | 'mobile' | 'portfolio';
    deleteRegToken: DeleteRegToken;
};
/**
 * Updates the triggers linked to push notifications for a given registration token.
 * If the provided registration token does not exist or is not in the current set of registration tokens,
 * a new registration token is created and used for the update.
 *
 * @param params - Update Push Params
 * @returns A promise that resolves with an object containing:
 * - isTriggersLinkedToPushNotifications: boolean indicating if the triggers were successfully updated.
 * - fcmToken: the new or existing Firebase Cloud Messaging token used for the update, if applicable.
 */
export declare function updateTriggerPushNotifications(params: UpdateTriggerPushNotificationsParams): Promise<{
    isTriggersLinkedToPushNotifications: boolean;
    fcmToken?: string | null;
}>;
type ListenToPushNotificationsParams = {
    env: PushNotificationEnv;
    listenToPushReceived: (notification: Types.INotification) => void | Promise<void>;
    listenToPushClicked: (event: NotificationEvent, notification?: Types.INotification) => void;
};
/**
 * Listens to push notifications and invokes the provided callback function with the received notification data.
 *
 * @param params - listen params
 * @returns A promise that resolves to an unsubscribe function to stop listening to push notifications.
 */
export declare function listenToPushNotifications(params: ListenToPushNotificationsParams): Promise<() => void>;
export {};
//# sourceMappingURL=services.d.ts.map