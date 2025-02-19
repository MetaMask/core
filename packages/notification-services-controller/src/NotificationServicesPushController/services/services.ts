import * as endpoints from './endpoints';
import type { PushNotificationEnv } from '../types';
import type {
  CreateRegToken,
  DeleteRegToken,
} from '../types/push-service-interface';

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

  const regToken = await createRegToken(env).catch(() => null);
  if (!regToken) {
    return null;
  }

  await updateLinksAPI(bearerToken, triggers, [{ token: regToken, platform }]);
  return regToken;
}

type DeactivatePushNotificationsParams = {
  // Push Links
  regToken: string;

  // Push Un-registration
  env: PushNotificationEnv;
  deleteRegToken: DeleteRegToken;
};

/**
 * Disables push notifications by removing the registration token
 * We do not need to unlink triggers, and remove old reg tokens (this is cleaned up in the back-end)
 *
 * @param params - Deactivate Push Params
 * @returns A promise that resolves with true if push notifications were successfully disabled, false otherwise.
 */
export async function deactivatePushNotifications(
  params: DeactivatePushNotificationsParams,
): Promise<boolean> {
  const { regToken, env, deleteRegToken } = params;

  // if we don't have a reg token, then we can early return
  if (!regToken) {
    return true;
  }

  const isTokenRemovedFromFCM = await deleteRegToken(env);
  if (!isTokenRemovedFromFCM) {
    return false;
  }

  return true;
}

type UpdateTriggerPushNotificationsParams = {
  // Push Links
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
    triggers,
    createRegToken,
    platform,
    deleteRegToken,
    env,
  } = params;

  await deleteRegToken(env);
  const newRegToken = await createRegToken(env);
  if (!newRegToken) {
    throw new Error('Failed to create a new registration token');
  }

  const isTriggersLinkedToPushNotifications = await updateLinksAPI(
    bearerToken,
    triggers,
    [{ token: newRegToken, platform }],
  );

  return {
    isTriggersLinkedToPushNotifications,
    fcmToken: newRegToken,
  };
}
