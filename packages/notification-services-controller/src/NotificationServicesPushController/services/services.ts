import log from 'loglevel';

import type { Types } from '../../NotificationServicesController';
import type { PushNotificationEnv } from '../types';
import * as endpoints from './endpoints';
import type { CreateRegToken, DeleteRegToken } from './push';
import {
  listenToPushNotificationsClicked,
  listenToPushNotificationsReceived,
} from './push/push-web';

export type RegToken = {
  token: string;
  platform: 'extension' | 'mobile' | 'portfolio';
};

/**
 * Links API Response Shape
 */
export type LinksResult = {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  trigger_ids: string[];
  // eslint-disable-next-line @typescript-eslint/naming-convention
  registration_tokens: RegToken[];
};

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
    const response = await fetch(endpoints.REGISTRATION_TOKENS_ENDPOINT, {
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
      // eslint-disable-next-line @typescript-eslint/naming-convention
      trigger_ids: triggers,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      registration_tokens: regTokens,
    };
    const response = await fetch(endpoints.REGISTRATION_TOKENS_ENDPOINT, {
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

type ActivatePushNotificationsParams = {
  // Push Links
  bearerToken: string;
  triggers: string[];

  // Push Registration
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
export async function activatePushNotifications(
  params: ActivatePushNotificationsParams,
): Promise<string | null> {
  const { bearerToken, triggers, env, createRegToken, platform } = params;

  const notificationLinks = await getPushNotificationLinks(bearerToken);

  if (!notificationLinks) {
    return null;
  }

  const regToken = await createRegToken(env).catch(() => null);
  if (!regToken) {
    return null;
  }

  const newRegTokens = new Set(notificationLinks.registration_tokens);
  newRegTokens.add({ token: regToken, platform });

  await updateLinksAPI(bearerToken, triggers, Array.from(newRegTokens));
  return regToken;
}

type DeactivatePushNotificationsParams = {
  // Push Links
  regToken: string;
  bearerToken: string;
  triggers: string[];

  // Push Un-registration
  env: PushNotificationEnv;
  deleteRegToken: DeleteRegToken;
};

/**
 * Disables push notifications by removing the registration token and unlinking triggers.
 *
 * @param params - Deactivate Push Params
 * @returns A promise that resolves with true if notifications were successfully disabled, false otherwise.
 */
export async function deactivatePushNotifications(
  params: DeactivatePushNotificationsParams,
): Promise<boolean> {
  const { regToken, bearerToken, triggers, env, deleteRegToken } = params;

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

  const isTokenRemovedFromFCM = await deleteRegToken(env);
  if (!isTokenRemovedFromFCM) {
    return false;
  }

  return true;
}

type UpdateTriggerPushNotificationsParams = {
  // Push Links
  regToken: string;
  bearerToken: string;
  triggers: string[];

  // Push Registration
  env: PushNotificationEnv;
  createRegToken: CreateRegToken;
  platform: 'extension' | 'mobile' | 'portfolio';

  // Push Un-registration
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
export async function updateTriggerPushNotifications(
  params: UpdateTriggerPushNotificationsParams,
): Promise<{
  isTriggersLinkedToPushNotifications: boolean;
  fcmToken?: string | null;
}> {
  const {
    bearerToken,
    regToken,
    triggers,
    createRegToken,
    platform,
    deleteRegToken,
    env,
  } = params;

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
    await deleteRegToken(env);
    newRegToken = await createRegToken(env);
    if (!newRegToken) {
      throw new Error('Failed to create a new registration token');
    }
    notificationLinks.registration_tokens.push({
      token: newRegToken,
      platform,
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

type ListenToPushNotificationsParams = {
  env: PushNotificationEnv;
  listenToPushReceived: (
    notification: Types.INotification,
  ) => void | Promise<void>;
  listenToPushClicked: (
    event: NotificationEvent,
    notification?: Types.INotification,
  ) => void;
};

/**
 * Listens to push notifications and invokes the provided callback function with the received notification data.
 *
 * @param params - listen params
 * @returns A promise that resolves to an unsubscribe function to stop listening to push notifications.
 */
export async function listenToPushNotifications(
  params: ListenToPushNotificationsParams,
): Promise<() => void> {
  const { env, listenToPushReceived, listenToPushClicked } = params;

  /*
  Push notifications require 2 listeners that need tracking (when creating and for tearing down):
  1. handling receiving a push notification (and the content we want to display)
  2. handling when a user clicks on a push notification
  */
  const unsubscribePushNotifications = await listenToPushNotificationsReceived(
    env,
    listenToPushReceived,
  );
  const unsubscribeNotificationClicks =
    listenToPushNotificationsClicked(listenToPushClicked);

  const unsubscribe = () => {
    unsubscribePushNotifications();
    unsubscribeNotificationClicks();
  };

  return unsubscribe;
}
