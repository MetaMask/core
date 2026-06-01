// We are defining that this file uses a webworker global scope.
// eslint-disable-next-line spaced-comment
/// <reference lib="webworker" />
import type { FirebaseApp } from 'firebase/app';
import { getApp, initializeApp } from 'firebase/app';
import { getToken, deleteToken } from 'firebase/messaging';
import {
  getMessaging,
  onBackgroundMessage,
  isSupported,
} from 'firebase/messaging/sw';
import type { Messaging, MessagePayload } from 'firebase/messaging/sw';
import log from 'loglevel';

import type { NotificationServicesPushControllerMessenger } from '../NotificationServicesPushController.js';
import type { PushNotificationEnv } from '../types/firebase.js';
import type { PushAnalyticsPayload } from '../types/index.js';
import { toPushAnalyticsPayload } from '../utils/to-push-analytics-payload.js';

declare const self: ServiceWorkerGlobalScope;

// Exported to help testing
// eslint-disable-next-line import-x/no-mutable-exports
export let supportedCache: boolean | null = null;

const getPushAvailability = async (): Promise<boolean> => {
  // Race condition is acceptable here - worst case is isSupported() is called
  // multiple times during initialization, which is harmless for caching a boolean
  // eslint-disable-next-line require-atomic-updates
  supportedCache ??= await isSupported();
  return supportedCache;
};

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
): Promise<Messaging | null> => {
  const supported = await getPushAvailability();
  if (!supported) {
    return null;
  }

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
    if (!messaging) {
      return null;
    }

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
    if (!messaging) {
      return true;
    }

    await deleteToken(messaging);
    return true;
  } catch {
    return false;
  }
}

/**
 * Service Worker Listener for when push notifications are received.
 *
 * @param env - push notification environment
 * @param handler - handler to actually showing notification, MUST BE PROVIDED
 * @returns unsubscribe handler
 */
async function listenToPushNotificationsReceived(
  env: PushNotificationEnv,
  handler?: (payload: PushAnalyticsPayload) => void | Promise<void>,
): Promise<(() => void) | null> {
  const messaging = await getFirebaseMessaging(env);
  if (!messaging) {
    return null;
  }

  const unsubscribePushNotifications = onBackgroundMessage(
    messaging,
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    async (payload: MessagePayload): Promise<void> => {
      try {
        const analyticsPayload = toPushAnalyticsPayload(payload?.data);

        if (!analyticsPayload) {
          return;
        }

        await handler?.(analyticsPayload);
      } catch (error) {
        // Do Nothing, cannot handle a bad notification
        log.error('Unable to handle push notification:', {
          notification: payload?.data,
          error,
        });
      }
    },
  );

  const unsubscribe = (): void => unsubscribePushNotifications();
  return unsubscribe;
}

/**
 * Builds the first-class push analytics payload from the top-level FCM `data`
 * keys written by push-services. Returns `null` when the required identity
 * fields are missing (e.g. a malformed or legacy payload), so callers can
 * safely bail out.
 *
 * @param data - the top-level FCM `data` map (all values are strings).
 * @returns the analytics payload, or `null` if required fields are absent.
 */
export function toPushAnalyticsPayload(
  data: Record<string, string> | undefined,
): PushAnalyticsPayload | null {
  if (!data?.notification_id || !data?.notification_type) {
    return null;
  }

  return {
    notification_id: data.notification_id,
    notification_type: data.notification_type,
    notification_subtype: data.notification_subtype ?? '',
    // Empty values are omitted by push-services, so treat blanks as absent.
    profile_id: data.profile_id || undefined,
    chain_id: data.chain_id ? Number(data.chain_id) : undefined,
    deeplink: data.deeplink || undefined,
  };
}

/**
 * Service Worker Listener for when a notification is clicked
 *
 * @param handler - listen to NotificationEvent from the service worker
 * @returns unsubscribe handler
 */
function listenToPushNotificationsClicked(
  handler: (e: NotificationEvent, payload: PushAnalyticsPayload) => void,
): () => void {
  const clickHandler = (event: NotificationEvent): void => {
    // Get Data
    const data: PushAnalyticsPayload = event?.notification?.data;
    handler(event, data);
  };

  self.addEventListener('notificationclick', clickHandler);
  const unsubscribe = (): void =>
    self.removeEventListener('notificationclick', clickHandler);
  return unsubscribe;
}

/**
 * A creator function that assists creating web-specific push notification subscription:
 * 1. Creates subscriptions for receiving and clicking notifications
 * 2. Creates click events when a notification is clicked
 * 3. Publishes controller messenger events
 *
 * @param props - props for this creator function.
 * @param props.onReceivedHandler - allows the developer to handle showing a notification
 * @param props.onClickHandler - allows the developer to handle clicking the notification
 * @param props.messenger - the controller messenger to publish the `onNewNotifications` and `pushNotificationsClicked` events
 * @returns a function that can be used by the controller
 */
export function createSubscribeToPushNotifications(props: {
  onReceivedHandler: (payload: PushAnalyticsPayload) => void | Promise<void>;
  onClickHandler: (e: NotificationEvent, payload: PushAnalyticsPayload) => void;
  messenger: NotificationServicesPushControllerMessenger;
}): (env: PushNotificationEnv) => Promise<() => void> {
  return async function (env: PushNotificationEnv): Promise<() => void> {
    const onBackgroundMessageSub = await listenToPushNotificationsReceived(
      env,
      async (analyticsPayload): Promise<void> => {
        props.messenger.publish(
          'NotificationServicesPushController:onNewNotifications',
          analyticsPayload,
        );
        await props.onReceivedHandler(analyticsPayload);
      },
    );
    const onClickSub = listenToPushNotificationsClicked(
      (event, analyticsPayload): void => {
        props.messenger.publish(
          'NotificationServicesPushController:pushNotificationClicked',
          analyticsPayload,
        );
        props.onClickHandler(event, analyticsPayload);
      },
    );

    const unsubscribe = (): void => {
      onBackgroundMessageSub?.();
      onClickSub();
    };

    return unsubscribe;
  };
}
