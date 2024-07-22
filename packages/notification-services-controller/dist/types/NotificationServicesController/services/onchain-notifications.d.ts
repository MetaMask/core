import type { OnChainRawNotification } from '../types/on-chain-notification/on-chain-notification';
import type { UserStorage } from '../types/user-storage/user-storage';
export type NotificationTrigger = {
    id: string;
    chainId: string;
    kind: string;
    address: string;
};
export declare const TRIGGER_API = "https://trigger.api.cx.metamask.io";
export declare const NOTIFICATION_API = "https://notification.api.cx.metamask.io";
export declare const TRIGGER_API_BATCH_ENDPOINT: string;
export declare const NOTIFICATION_API_LIST_ENDPOINT: string;
export declare const NOTIFICATION_API_LIST_ENDPOINT_PAGE_QUERY: (page: number) => string;
export declare const NOTIFICATION_API_MARK_ALL_AS_READ_ENDPOINT: string;
/**
 * Creates on-chain triggers based on the provided notification triggers.
 * This method generates a unique token for each trigger using the trigger ID and storage key,
 * proving ownership of the trigger being updated. It then makes an API call to create these triggers.
 * Upon successful creation, it updates the userStorage to reflect the new trigger status.
 *
 * @param userStorage - The user's storage object where triggers and their statuses are stored.
 * @param storageKey - A key used along with the trigger ID to generate a unique token for each trigger.
 * @param bearerToken - The JSON Web Token used for authentication in the API call.
 * @param triggers - An array of notification triggers to be created. Each trigger includes an ID, chain ID, kind, and address.
 * @returns A promise that resolves to void. Throws an error if the API call fails or if there's an issue creating the triggers.
 */
export declare function createOnChainTriggers(userStorage: UserStorage, storageKey: string, bearerToken: string, triggers: NotificationTrigger[]): Promise<void>;
/**
 * Deletes on-chain triggers based on the provided UUIDs.
 * This method generates a unique token for each trigger using the UUID and storage key,
 * proving ownership of the trigger being deleted. It then makes an API call to delete these triggers.
 * Upon successful deletion, it updates the userStorage to remove the deleted trigger statuses.
 *
 * @param userStorage - The user's storage object where triggers and their statuses are stored.
 * @param storageKey - A key used along with the UUID to generate a unique token for each trigger.
 * @param bearerToken - The JSON Web Token used for authentication in the API call.
 * @param uuids - An array of UUIDs representing the triggers to be deleted.
 * @returns A promise that resolves to the updated UserStorage object. Throws an error if the API call fails or if there's an issue deleting the triggers.
 */
export declare function deleteOnChainTriggers(userStorage: UserStorage, storageKey: string, bearerToken: string, uuids: string[]): Promise<UserStorage>;
/**
 * Fetches on-chain notifications for the given user storage and BearerToken.
 * This method iterates through the userStorage to find enabled triggers and fetches notifications for those triggers.
 * It makes paginated API calls to the notifications service, transforming and aggregating the notifications into a single array.
 * The process stops either when all pages have been fetched or when a page has less than 100 notifications, indicating the end of the data.
 *
 * @param userStorage - The user's storage object containing trigger information.
 * @param bearerToken - The JSON Web Token used for authentication in the API call.
 * @returns A promise that resolves to an array of OnChainRawNotification objects. If no triggers are enabled or an error occurs, it may return an empty array.
 */
export declare function getOnChainNotifications(userStorage: UserStorage, bearerToken: string): Promise<OnChainRawNotification[]>;
/**
 * Marks the specified notifications as read.
 * This method sends a POST request to the notifications service to mark the provided notification IDs as read.
 * If the operation is successful, it completes without error. If the operation fails, it throws an error with details.
 *
 * @param bearerToken - The JSON Web Token used for authentication in the API call.
 * @param notificationIds - An array of notification IDs to be marked as read.
 * @returns A promise that resolves to void. The promise will reject if there's an error during the API call or if the response status is not 200.
 */
export declare function markNotificationsAsRead(bearerToken: string, notificationIds: string[]): Promise<void>;
//# sourceMappingURL=onchain-notifications.d.ts.map