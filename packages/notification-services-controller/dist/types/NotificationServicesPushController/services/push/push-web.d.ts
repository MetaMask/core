/// <reference lib="webworker" />
import type { Types } from '../../../NotificationServicesController';
import type { PushNotificationEnv } from '../../types/firebase';
/**
 * Creates a registration token for Firebase Cloud Messaging.
 *
 * @param env - env to configure push notifications
 * @returns A promise that resolves with the registration token or null if an error occurs.
 */
export declare function createRegToken(env: PushNotificationEnv): Promise<string | null>;
/**
 * Deletes the Firebase Cloud Messaging registration token.
 *
 * @param env - env to configure push notifications
 * @returns A promise that resolves with true if the token was successfully deleted, false otherwise.
 */
export declare function deleteRegToken(env: PushNotificationEnv): Promise<boolean>;
/**
 * Service Worker Listener for when push notifications are received.
 * @param env - push notification environment
 * @param handler - handler to actually showing notification, MUST BE PROVEDED
 * @returns unsubscribe handler
 */
export declare function listenToPushNotificationsReceived(env: PushNotificationEnv, handler: (notification: Types.INotification) => void | Promise<void>): Promise<() => void>;
/**
 * Service Worker Listener for when a notification is clicked
 *
 * @param handler - listen to NotificationEvent from the service worker
 * @returns unsubscribe handler
 */
export declare function listenToPushNotificationsClicked(handler: (e: NotificationEvent, notification?: Types.INotification) => void): () => void;
//# sourceMappingURL=push-web.d.ts.map