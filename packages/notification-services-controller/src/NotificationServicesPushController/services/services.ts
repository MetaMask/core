import * as endpoints from './endpoints';
import type { PushNotificationEnv } from '../types';
import type {
  CreateRegToken,
  DeleteRegToken,
} from '../types/push-service-interface';

export type RegToken = {
  token: string;
  platform: 'extension' | 'mobile' | 'portfolio';
  locale: string;
  oldToken?: string;
};

/**
 * Links API Response Shape
 */
export type PushTokenRequest = {
  addresses: string[];
  registration_token: {
    token: string;
    platform: 'extension' | 'mobile' | 'portfolio';
    locale: string;
    oldToken?: string;
  };
};

type UpdatePushTokenParams = {
  bearerToken: string;
  addresses: string[];
  regToken: RegToken;
};

/**
 * Updates the push notification links on a remote API.
 *
 * @param params - params for invoking update reg token
 * @returns A promise that resolves with true if the update was successful, false otherwise.
 */
export async function updateLinksAPI(
  params: UpdatePushTokenParams,
): Promise<boolean> {
  try {
    const body: PushTokenRequest = {
      addresses: params.addresses,
      registration_token: params.regToken,
    };
    const response = await fetch(endpoints.REGISTRATION_TOKENS_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.bearerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    return response.ok;
  } catch {
    return false;
  }
}

type ActivatePushNotificationsParams = {
  // Create Push Token
  env: PushNotificationEnv;
  createRegToken: CreateRegToken;

  // Other Request Parameters
  bearerToken: string;
  addresses: string[];
  regToken: Pick<RegToken, 'locale' | 'platform' | 'oldToken'>;
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
  const { env, createRegToken } = params;

  const regToken = await createRegToken(env).catch(() => null);
  if (!regToken) {
    return null;
  }

  await updateLinksAPI({
    bearerToken: params.bearerToken,
    addresses: params.addresses,
    regToken: {
      token: regToken,
      platform: params.regToken.platform,
      locale: params.regToken.locale,
      oldToken: params.regToken.oldToken,
    },
  });

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
