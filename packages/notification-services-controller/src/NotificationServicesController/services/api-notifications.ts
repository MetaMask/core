import log from 'loglevel';

import { notificationsConfigCache } from './notification-config-cache';
import { toRawAPINotification } from '../../shared/to-raw-notification';
import type {
  NormalisedAPINotification,
  Schema,
  UnprocessedRawNotification,
} from '../types/notification-api';
import { makeApiCall } from '../utils/utils';

export type NotificationTrigger = {
  id: string;
  chainId: string;
  kind: string;
  address: string;
};

export type ENV = 'prd' | 'uat' | 'dev';

const TRIGGER_API_ENV = {
  dev: 'https://trigger.dev-api.cx.metamask.io',
  uat: 'https://trigger.uat-api.cx.metamask.io',
  prd: 'https://trigger.api.cx.metamask.io',
} satisfies Record<ENV, string>;

export const TRIGGER_API = (env: ENV = 'prd') =>
  TRIGGER_API_ENV[env] ?? TRIGGER_API_ENV.prd;

const NOTIFICATION_API_ENV = {
  dev: 'https://notification.dev-api.cx.metamask.io',
  uat: 'https://notification.uat-api.cx.metamask.io',
  prd: 'https://notification.api.cx.metamask.io',
};

export const NOTIFICATION_API = (env: ENV = 'prd') =>
  NOTIFICATION_API_ENV[env] ?? NOTIFICATION_API_ENV.prd;

// Gets notification settings for each account provided
export const TRIGGER_API_NOTIFICATIONS_QUERY_ENDPOINT = (env: ENV = 'prd') =>
  `${TRIGGER_API(env)}/api/v2/notifications/query`;

// Used to create/update account notifications for each account provided
export const TRIGGER_API_NOTIFICATIONS_ENDPOINT = (env: ENV = 'prd') =>
  `${TRIGGER_API(env)}/api/v2/notifications`;

// Lists notifications for each account provided
export const NOTIFICATION_API_LIST_ENDPOINT = (env: ENV = 'prd') =>
  `${NOTIFICATION_API(env)}/api/v3/notifications`;

// Makrs notifications as read
export const NOTIFICATION_API_MARK_ALL_AS_READ_ENDPOINT = (env: ENV = 'prd') =>
  `${NOTIFICATION_API(env)}/api/v3/notifications/mark-as-read`;

/**
 * fetches notification config (accounts enabled vs disabled)
 *
 * @param bearerToken - jwt
 * @param addresses - list of addresses to check
 * @param env - the environment to use for the API call
 * NOTE the API will return addresses config with false if they have not been created before.
 * NOTE this is cached for 1s to prevent multiple update calls
 * @returns object of notification config, or null if missing
 */
export async function getNotificationsApiConfigCached(
  bearerToken: string,
  addresses: string[],
  env: ENV = 'prd',
) {
  if (addresses.length === 0) {
    return [];
  }

  addresses = addresses.map((a) => a.toLowerCase());

  const cached = notificationsConfigCache.get(addresses);
  if (cached) {
    return cached;
  }

  type RequestBody = { address: string }[];
  type Response = { address: string; enabled: boolean }[];
  const body: RequestBody = addresses.map((address) => ({ address }));
  const data = await makeApiCall(
    bearerToken,
    TRIGGER_API_NOTIFICATIONS_QUERY_ENDPOINT(env),
    'POST',
    body,
  )
    .then<Response | null>((r) => (r.ok ? r.json() : null))
    .catch(() => null);

  const result = data ?? [];

  if (result.length > 0) {
    notificationsConfigCache.set(result);
  }

  return result;
}

/**
 * updates notifications for a given addresses
 *
 * @param bearerToken - jwt
 * @param addresses - list of addresses to check
 * @param env - the environment to use for the API call
 * @returns void
 */
export async function updateOnChainNotifications(
  bearerToken: string,
  addresses: { address: string; enabled: boolean }[],
  env: ENV = 'prd',
) {
  if (addresses.length === 0) {
    return;
  }

  addresses = addresses.map((a) => {
    a.address = a.address.toLowerCase();
    return a;
  });

  type RequestBody = { address: string; enabled: boolean }[];
  const body: RequestBody = addresses;
  await makeApiCall(
    bearerToken,
    TRIGGER_API_NOTIFICATIONS_ENDPOINT(env),
    'POST',
    body,
  )
    .then(() => notificationsConfigCache.set(addresses))
    .catch(() => null);
}

/**
 * Fetches on-chain notifications for the given addresses
 *
 * @param bearerToken - The JSON Web Token used for authentication in the API call.
 * @param addresses - List of addresses
 * @param locale - to generate translated notifications
 * @param platform - filter notifications for specific platforms ('extension' | 'mobile')
 * @param env - the environment to use for the API call
 * @returns A promise that resolves to an array of NormalisedAPINotification objects. If no notifications are enabled or an error occurs, it may return an empty array.
 */
export async function getAPINotifications(
  bearerToken: string,
  addresses: string[],
  locale: string,
  platform: 'extension' | 'mobile',
  env: ENV = 'prd',
): Promise<NormalisedAPINotification[]> {
  if (addresses.length === 0) {
    return [];
  }

  type RequestBody =
    Schema.paths['/api/v3/notifications']['post']['requestBody']['content']['application/json'];
  type APIResponse =
    Schema.paths['/api/v3/notifications']['post']['responses']['200']['content']['application/json'];

  const body: RequestBody = {
    addresses: addresses.map((a) => a.toLowerCase()),
    locale,
    platform,
  };
  const notifications = await makeApiCall(
    bearerToken,
    NOTIFICATION_API_LIST_ENDPOINT(env),
    'POST',
    body,
  )
    .then<APIResponse | null>((r) => (r.ok ? r.json() : null))
    .catch(() => null);

  // Transform and sort notifications
  const transformedNotifications = notifications
    ?.map((n): UnprocessedRawNotification | undefined => {
      if (!n.notification_type) {
        return undefined;
      }

      try {
        return toRawAPINotification(n);
      } catch {
        return undefined;
      }
    })
    .filter((n): n is NormalisedAPINotification => Boolean(n));

  return transformedNotifications ?? [];
}

/**
 * Marks the specified notifications as read.
 * This method sends a POST request to the notifications service to mark the provided notification IDs as read.
 * If the operation is successful, it completes without error. If the operation fails, it throws an error with details.
 *
 * @param bearerToken - The JSON Web Token used for authentication in the API call.
 * @param notificationIds - An array of notification IDs to be marked as read.
 * @param env - the environment to use for the API call
 * @returns A promise that resolves to void. The promise will reject if there's an error during the API call or if the response status is not 200.
 */
export async function markNotificationsAsRead(
  bearerToken: string,
  notificationIds: string[],
  env: ENV = 'prd',
): Promise<void> {
  if (notificationIds.length === 0) {
    return;
  }

  type ResponseBody =
    Schema.paths['/api/v3/notifications/mark-as-read']['post']['requestBody']['content']['application/json'];
  const body: ResponseBody = {
    ids: notificationIds,
  };

  try {
    await makeApiCall(
      bearerToken,
      NOTIFICATION_API_MARK_ALL_AS_READ_ENDPOINT(env),
      'POST',
      body,
    );
  } catch (err) {
    log.error('Error marking notifications as read:', err);
  }
}
