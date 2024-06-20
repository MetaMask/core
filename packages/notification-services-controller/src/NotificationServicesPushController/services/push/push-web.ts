// We are defining that this file uses a webworker global scope.
// eslint-disable-next-line spaced-comment
/// <reference lib="webworker" />
import type { FirebaseApp } from 'firebase/app';
import { getApp, initializeApp } from 'firebase/app';
import { getToken, deleteToken } from 'firebase/messaging';
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';
import type { Messaging, MessagePayload } from 'firebase/messaging/sw';
import log from 'loglevel';

import type { Types } from '../../../NotificationServicesController';
import { Processors } from '../../../NotificationServicesController';
import type { PushNotificationEnv } from '../../types/firebase';

declare const self: ServiceWorkerGlobalScope;

const createFirebaseApp = async (
  env: PushNotificationEnv,
): Promise<FirebaseApp> => {
  try {
    return getApp();
  } catch {
    const firebaseConfig = {
      apiKey: env.apiKey,
      authDomain: env.authDomain,
      storageBucket: env.storageBucket,
      projectId: env.projectId,
      messagingSenderId: env.messagingSenderId,
      appId: env.appId,
      measurementId: env.measurementId,
    };
    return initializeApp(firebaseConfig);
  }
};

const getFirebaseMessaging = async (
  env: PushNotificationEnv,
): Promise<Messaging> => {
  const app = await createFirebaseApp(env);
  return getMessaging(app);
};

/**
 * Creates a registration token for Firebase Cloud Messaging.
 *
 * @param env - env to configure push notifications
 * @returns A promise that resolves with the registration token or null if an error occurs.
 */
export async function createRegToken(
  env: PushNotificationEnv,
): Promise<string | null> {
  try {
    const messaging = await getFirebaseMessaging(env);
    const token = await getToken(messaging, {
      serviceWorkerRegistration: self.registration,
      vapidKey: env.vapidKey,
    });
    return token;
  } catch {
    return null;
  }
}

/**
 * Deletes the Firebase Cloud Messaging registration token.
 *
 * @param env - env to configure push notifications
 * @returns A promise that resolves with true if the token was successfully deleted, false otherwise.
 */
export async function deleteRegToken(
  env: PushNotificationEnv,
): Promise<boolean> {
  try {
    const messaging = await getFirebaseMessaging(env);
    await deleteToken(messaging);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Service Worker Listener for when push notifications are received.
 * @param env - push notification environment
 * @param handler - handler to actually showing notification, MUST BE PROVEDED
 * @returns unsubscribe handler
 */
export async function listenToPushNotificationsReceived(
  env: PushNotificationEnv,
  handler: (notification: Types.INotification) => void | Promise<void>,
) {
  const messaging = await getFirebaseMessaging(env);
  const unsubscribePushNotifications = onBackgroundMessage(
    messaging,
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    async (payload: MessagePayload) => {
      try {
        const notificationData: Types.NotificationUnion = payload?.data?.data
          ? JSON.parse(payload?.data?.data)
          : undefined;

        if (!notificationData) {
          return;
        }

        const notification = Processors.processNotification(notificationData);
        await handler(notification);
      } catch (error) {
        // Do Nothing, cannot parse a bad notification
        log.error('Unable to send push notification:', {
          notification: payload?.data?.data,
          error,
        });
        throw new Error('Unable to send push notification');
      }
    },
  );

  const unsubscribe = () => unsubscribePushNotifications();
  return unsubscribe;
}

/**
 * Service Worker Listener for when a notification is clicked
 *
 * @param handler - listen to NotificationEvent from the service worker
 * @returns unsubscribe handler
 */
export function listenToPushNotificationsClicked(
  handler: (e: NotificationEvent, notification?: Types.INotification) => void,
) {
  const clickHandler = (event: NotificationEvent) => {
    // Get Data
    const data: Types.INotification = event?.notification?.data;
    handler(event, data);
  };

  self.addEventListener('notificationclick', clickHandler);
  const unsubscribe = () =>
    self.removeEventListener('notificationclick', clickHandler);
  return unsubscribe;
}
