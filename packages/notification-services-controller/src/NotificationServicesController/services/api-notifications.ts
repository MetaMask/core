import log from 'loglevel';

import { toRawAPINotification } from '../../shared/to-raw-notification';
import type {
  NormalisedAPINotification,
  Schema,
  UnprocessedRawNotification,
} from '../types/notification-api';
import { makeApiCall } from '../utils/utils';
import { notificationsConfigCache } from './notification-config-cache';

export type ENV = 'prd' | 'uat' | 'dev';

const TRIGGER_API_ENV = {
  dev: 'https://trigger.dev-api.cx.metamask.io',
  uat: 'https://trigger.uat-api.cx.metamask.io',
  prd: 'https://trigger.api.cx.metamask.io',
} satisfies Record<ENV, string>;

export const TRIGGER_API = (env: ENV = 'prd'): string =>
  TRIGGER_API_ENV[env] ?? TRIGGER_API_ENV.prd;

const NOTIFICATION_API_ENV = {
  dev: 'https://notification.dev-api.cx.metamask.io',
  uat: 'https://notification.uat-api.cx.metamask.io',
  prd: 'https://notification.api.cx.metamask.io',
};

export const NOTIFICATION_API = (env: ENV = 'prd'): string =>
  NOTIFICATION_API_ENV[env] ?? NOTIFICATION_API_ENV.prd;

// Gets notification settings for each account provided
export const TRIGGER_API_NOTIFICATIONS_QUERY_ENDPOINT = (
  env: ENV = 'prd',
): string => `${TRIGGER_API(env)}/api/v2/notifications/query`;

// Lists notifications for each address provided
export const NOTIFICATION_API_LIST_ENDPOINT = (env: ENV = 'prd'): string =>
  `${NOTIFICATION_API(env)}/api/v3/notifications`;

// Marks notifications as read
export const NOTIFICATION_API_MARK_ALL_AS_READ_ENDPOINT = (
  env: ENV = 'prd',
): string => `${NOTIFICATION_API(env)}/api/v3/notifications/mark-as-read`;

/**
 * Fetches notification config (accounts enabled vs disabled) from the Trigger API.
 *
 * @param bearerToken - JWT used for authentication.
 * @param addresses - List of addresses to check.
 * @param env - The environment to use for the API call.
 * @returns Trigger API notification config, or an empty array if unavailable.
 */
export async function getNotificationsApiConfigCached(
  bearerToken: string,
  addresses: string[],
  env: ENV = 'prd',
): Promise<{ address: string; enabled: boolean }[]> {
  if (addresses.length === 0) {
    return [];
  }

  const normalizedAddresses = addresses.map((addr) => addr.toLowerCase());

  const cached = notificationsConfigCache.get(normalizedAddresses);
  if (cached) {
    return cached;
  }

  type RequestBody = { address: string }[];
  type Response = { address: string; enabled: boolean }[];
  const body: RequestBody = normalizedAddresses.map((address) => ({ address }));
  const apiResponse = await makeApiCall(
    bearerToken,
    TRIGGER_API_NOTIFICATIONS_QUERY_ENDPOINT(env),
    'POST',
    body,
  )
    .then<Response | null>((response) => (response.ok ? response.json() : null))
    .catch(() => null);

  const result = apiResponse ?? [];

  if (result.length > 0) {
    notificationsConfigCache.set(result);
  }

  return result;
}

/**
 * Fetches on-chain notifications for the given addresses.
 *
 * @param bearerToken - The JSON Web Token used for authentication in the API call.
 * @param addresses - List of addresses to fetch notifications for.
 * @param locale - User's locale, used to translate server-rendered notifications.
 * @param platform - Filters notifications for a specific platform.
 * @param env - The environment to use for the API call.
 * @returns An array of {@link NormalisedAPINotification}. Returns an empty array on transport or parse errors.
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
    addresses: addresses.map((addr) => addr.toLowerCase()),
    locale,
    platform,
  };
  const notifications = await makeApiCall(
    bearerToken,
    NOTIFICATION_API_LIST_ENDPOINT(env),
    'POST',
    body,
  )
    .then<APIResponse | null>((response) =>
      response.ok ? response.json() : null,
    )
    .catch(() => null);

  // Transform and sort notifications
  const transformedNotifications = notifications
    ?.map((notification): UnprocessedRawNotification | undefined => {
      if (!notification.notification_type) {
        return undefined;
      }

      try {
        return toRawAPINotification(notification);
      } catch {
        return undefined;
      }
    })
    .filter((item): item is NormalisedAPINotification => Boolean(item));

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
  } catch (error) {
    log.error('Error marking notifications as read:', error);
  }
}
