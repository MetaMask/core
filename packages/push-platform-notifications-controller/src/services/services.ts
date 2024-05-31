import type { FirebaseApp } from '@firebase/app';
import { getApp, initializeApp } from '@firebase/app';
import { getToken, deleteToken } from '@firebase/messaging';
import { getMessaging, onBackgroundMessage } from '@firebase/messaging/sw';
import type {
  Messaging,
  MessagePayload,
  Unsubscribe,
} from '@firebase/messaging/sw';
import type { Notification as INotification } from '@metamask/notifications-controller';
import log from 'loglevel';

import {
  FIREBASE_API_KEY,
  FIREBASE_APP_ID,
  FIREBASE_AUTH_DOMAIN,
  FIREBASE_MEASUREMENT_ID,
  FIREBASE_MESSAGING_SENDER_ID,
  FIREBASE_PROJECT_ID,
  FIREBASE_STORAGE_BUCKET,
  PUSH_NOTIFICATIONS_SERVICE_URL,
  VAPID_KEY,
} from '../constants';
import {
  onNotificationClick,
  onPushNotification,
} from '../utils/get-notification-message';

const url = PUSH_NOTIFICATIONS_SERVICE_URL;
const REGISTRATION_TOKENS_ENDPOINT = `${url}/v1/link`;
const sw = self as unknown as ServiceWorkerGlobalScope;

export type RegToken = {
  token: string;
  platform: 'extension' | 'mobile' | 'portfolio';
};

export type LinksResult = {
  trigger_ids: string[];
  registration_tokens: RegToken[];
};

/**
 * Attempts to retrieve an existing Firebase app instance. If no instance exists, it initializes a new app with the provided configuration.
 *
 * @returns The Firebase app instance.
 */
export async function createFirebaseApp(): Promise<FirebaseApp> {
  try {
    return getApp();
  } catch {
    const firebaseConfig = {
      apiKey: FIREBASE_API_KEY,
      authDomain: FIREBASE_AUTH_DOMAIN,
      storageBucket: FIREBASE_STORAGE_BUCKET,
      projectId: FIREBASE_PROJECT_ID,
      messagingSenderId: FIREBASE_MESSAGING_SENDER_ID,
      appId: FIREBASE_APP_ID,
      measurementId: FIREBASE_MEASUREMENT_ID,
    };
    return initializeApp(firebaseConfig);
  }
}

/**
 * Retrieves the Firebase Messaging service instance.
 *
 * This function first ensures a Firebase app instance is created or retrieved by calling `createFirebaseApp`.
 * It then initializes and returns the Firebase Messaging service associated with the Firebase app.
 *
 * @returns A promise that resolves with the Firebase Messaging service instance.
 */
export async function getFirebaseMessaging(): Promise<Messaging> {
  const app = await createFirebaseApp();
  return getMessaging(app);
}

/**
 * Creates a registration token for Firebase Cloud Messaging.
 *
 * @returns A promise that resolves with the registration token or null if an error occurs.
 */
export async function createRegToken(): Promise<string | null> {
  try {
    const messaging = await getFirebaseMessaging();
    const token = await getToken(messaging, {
      serviceWorkerRegistration: sw.registration,
      vapidKey: VAPID_KEY,
    });
    return token;
  } catch {
    return null;
  }
}

/**
 * Deletes the Firebase Cloud Messaging registration token.
 *
 * @returns A promise that resolves with true if the token was successfully deleted, false otherwise.
 */
export async function deleteRegToken(): Promise<boolean> {
  try {
    const messaging = await getFirebaseMessaging();
    await deleteToken(messaging);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Fetches push notification links from a remote endpoint using a BearerToken for authorization.
 *
 * @param bearerToken - The JSON Web Token used for authorization.
 * @returns A promise that resolves with the links result or null if an error occurs.
 */
export async function getPushNotificationLinks(
  bearerToken: string,
): Promise<LinksResult | null> {
  try {
    const response = await fetch(REGISTRATION_TOKENS_ENDPOINT, {
      headers: { Authorization: `Bearer ${bearerToken}` },
    });
    if (!response.ok) {
      log.error('Failed to fetch the push notification links');
      throw new Error('Failed to fetch the push notification links');
    }
    return response.json() as Promise<LinksResult>;
  } catch (error) {
    log.error('Failed to fetch the push notification links', error);
    return null;
  }
}

/**
 * Updates the push notification links on a remote API.
 *
 * @param bearerToken - The JSON Web Token used for authorization.
 * @param triggers - An array of trigger identifiers.
 * @param regTokens - An array of registration tokens.
 * @returns A promise that resolves with true if the update was successful, false otherwise.
 */
export async function updateLinksAPI(
  bearerToken: string,
  triggers: string[],
  regTokens: RegToken[],
): Promise<boolean> {
  try {
    const body: LinksResult = {
      trigger_ids: triggers,
      registration_tokens: regTokens,
    };
    const response = await fetch(REGISTRATION_TOKENS_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    return response.status === 200;
  } catch {
    return false;
  }
}

/**
 * Enables push notifications by registering the device and linking triggers.
 *
 * @param bearerToken - The JSON Web Token used for authorization.
 * @param triggers - An array of trigger identifiers.
 * @returns A promise that resolves with an object containing the success status and the BearerToken token.
 */
export async function activatePushNotifications(
  bearerToken: string,
  triggers: string[],
): Promise<string | null> {
  const notificationLinks = await getPushNotificationLinks(bearerToken);

  if (!notificationLinks) {
    return null;
  }

  const regToken = await createRegToken().catch(() => null);
  if (!regToken) {
    return null;
  }

  const newRegTokens = new Set(notificationLinks.registration_tokens);
  newRegTokens.add({ token: regToken, platform: 'extension' });

  await updateLinksAPI(bearerToken, triggers, Array.from(newRegTokens));
  return regToken;
}

/**
 * Listens to push notifications and invokes the provided callback function with the received notification data.
 *
 * @param onNewNotification - The callback function to be invoked with the received notification data.
 * @returns A promise that resolves to an unsubscribe function to stop listening to push notifications.
 */
export async function listenToPushNotifications(
  onNewNotification: (notification: INotification) => void,
): Promise<Unsubscribe> {
  // Firebase
  const messaging = await getFirebaseMessaging();
  const unsubscribe = onBackgroundMessage(
    messaging,
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    async (payload: MessagePayload): Promise<void> => {
      const typedPayload = payload;

      try {
        const notificationData = typedPayload?.data?.data
          ? JSON.parse(typedPayload?.data?.data)
          : undefined;
        if (!notificationData) {
          return;
        }

        onNewNotification(notificationData);

        await onPushNotification(notificationData);
      } catch (error) {
        log.error('Unable to send push notification:', {
          notification: payload?.data?.data,
          error,
        });
        throw new Error('Unable to send push notification');
      }
    },
  );

  return unsubscribe;
}

/**
 * Handle Clicking Notifications.
 */
sw.addEventListener('notificationclick', onNotificationClick);

/**
 * Disables push notifications by removing the registration token and unlinking triggers.
 *
 * @param regToken - The registration token to be removed.
 * @param bearerToken - The JSON Web Token used for authorization.
 * @param triggers - An array of trigger identifiers to be unlinked.
 * @returns A promise that resolves with true if notifications were successfully disabled, false otherwise.
 */
export async function deactivatePushNotifications(
  regToken: string,
  bearerToken: string,
  triggers: string[],
): Promise<boolean> {
  // if we don't have a reg token, then we can early return
  if (!regToken) {
    return true;
  }

  const notificationLinks = await getPushNotificationLinks(bearerToken);
  if (!notificationLinks) {
    return false;
  }

  const filteredRegTokens = notificationLinks.registration_tokens.filter(
    (r) => r.token !== regToken,
  );

  const isTokenRemovedFromAPI = await updateLinksAPI(
    bearerToken,
    triggers,
    filteredRegTokens,
  );
  if (!isTokenRemovedFromAPI) {
    return false;
  }

  const isTokenRemovedFromFCM = await deleteRegToken();
  if (!isTokenRemovedFromFCM) {
    return false;
  }

  return true;
}

/**
 * Updates the triggers linked to push notifications for a given registration token.
 * If the provided registration token does not exist or is not in the current set of registration tokens,
 * a new registration token is created and used for the update.
 *
 * @param regToken - The registration token to update triggers for. If null or not found, a new token will be created.
 * @param bearerToken - The JSON Web Token used for authorization.
 * @param triggers - An array of new trigger identifiers to link.
 * @returns A promise that resolves with an object containing:
 * - isTriggersLinkedToPushNotifications: boolean indicating if the triggers were successfully updated.
 * - fcmToken: the new or existing Firebase Cloud Messaging token used for the update, if applicable.
 */
export async function updateTriggerPushNotifications(
  regToken: string,
  bearerToken: string,
  triggers: string[],
): Promise<{
  isTriggersLinkedToPushNotifications: boolean;
  fcmToken?: string | null;
}> {
  const notificationLinks = await getPushNotificationLinks(bearerToken);
  if (!notificationLinks) {
    return { isTriggersLinkedToPushNotifications: false };
  }
  // Create new registration token if doesn't exist
  const hasRegToken = Boolean(
    regToken &&
      notificationLinks.registration_tokens.some((r) => r.token === regToken),
  );

  let newRegToken: string | null = null;
  if (!hasRegToken) {
    await deleteRegToken();
    newRegToken = await createRegToken();
    if (!newRegToken) {
      throw new Error('Failed to create a new registration token');
    }
    notificationLinks.registration_tokens.push({
      token: newRegToken,
      platform: 'extension',
    });
  }

  const isTriggersLinkedToPushNotifications = await updateLinksAPI(
    bearerToken,
    triggers,
    notificationLinks.registration_tokens,
  );

  return {
    isTriggersLinkedToPushNotifications,
    fcmToken: newRegToken ?? null,
  };
}
