import log from 'loglevel';

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

const NOTIFICATION_API_ENV = {
  dev: 'https://notification.dev-api.cx.metamask.io',
  uat: 'https://notification.uat-api.cx.metamask.io',
  prd: 'https://notification.api.cx.metamask.io',
};

export const NOTIFICATION_API = (env: ENV = 'prd'): string =>
  NOTIFICATION_API_ENV[env] ?? NOTIFICATION_API_ENV.prd;

// Lists notifications for each address provided.
export const NOTIFICATION_API_LIST_ENDPOINT = (env: ENV = 'prd'): string =>
  `${NOTIFICATION_API(env)}/api/v3/notifications`;

// Marks notifications as read.
export const NOTIFICATION_API_MARK_ALL_AS_READ_ENDPOINT = (
  env: ENV = 'prd',
): string => `${NOTIFICATION_API(env)}/api/v3/notifications/mark-as-read`;

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
