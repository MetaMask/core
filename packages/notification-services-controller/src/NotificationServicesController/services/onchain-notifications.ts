import log from 'loglevel';

import { notificationsConfigCache } from './notification-config-cache';
import { toRawOnChainNotification } from '../../shared/to-raw-notification';
import type {
  OnChainRawNotification,
  UnprocessedOnChainRawNotification,
} from '../types/on-chain-notification/on-chain-notification';
import { makeApiCall } from '../utils/utils';

export type NotificationTrigger = {
  id: string;
  chainId: string;
  kind: string;
  address: string;
};

export const TRIGGER_API = 'https://trigger.api.cx.metamask.io';
export const NOTIFICATION_API = 'https://notification.api.cx.metamask.io';

// Gets notification settings for each account provided
export const TRIGGER_API_NOTIFICATIONS_QUERY_ENDPOINT = `${TRIGGER_API}/api/v2/notifications/query`;

// Used to create/update account notifications for each account provided
export const TRIGGER_API_NOTIFICATIONS_ENDPOINT = `${TRIGGER_API}/api/v2/notifications`;

// Lists notifications for each account provided
export const NOTIFICATION_API_LIST_ENDPOINT = `${NOTIFICATION_API}/api/v2/notifications`;

// Makrs notifications as read
export const NOTIFICATION_API_MARK_ALL_AS_READ_ENDPOINT = `${NOTIFICATION_API}/api/v2/notifications/mark-as-read`;

/**
 * fetches notification config (accounts enabled vs disabled)
 *
 * @param bearerToken - jwt
 * @param addresses - list of addresses to check
 * NOTE the API will return addresses config with false if they have not been created before.
 * NOTE this is cached for 1s to prevent multiple update calls
 * @returns object of notification config, or null if missing
 */
export async function getOnChainNotificationsConfigCached(
  bearerToken: string,
  addresses: string[],
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
    TRIGGER_API_NOTIFICATIONS_QUERY_ENDPOINT,
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
 * @returns void
 */
export async function updateOnChainNotifications(
  bearerToken: string,
  addresses: { address: string; enabled: boolean }[],
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
    TRIGGER_API_NOTIFICATIONS_ENDPOINT,
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
 * @returns A promise that resolves to an array of OnChainRawNotification objects. If no triggers are enabled or an error occurs, it may return an empty array.
 */
export async function getOnChainNotifications(
  bearerToken: string,
  addresses: string[],
): Promise<OnChainRawNotification[]> {
  if (addresses.length === 0) {
    return [];
  }

  addresses = addresses.map((a) => a.toLowerCase());

  type RequestBody = { address: string }[];
  const body: RequestBody = addresses.map((address) => ({ address }));
  const notifications = await makeApiCall(
    bearerToken,
    NOTIFICATION_API_LIST_ENDPOINT,
    'POST',
    body,
  )
    .then<UnprocessedOnChainRawNotification[] | null>((r) =>
      r.ok ? r.json() : null,
    )
    .catch(() => null);

  // Transform and sort notifications
  const transformedNotifications = notifications
    ?.map((n): OnChainRawNotification | undefined => {
      if (!n.data?.kind) {
        return undefined;
      }

      return toRawOnChainNotification(n);
    })
    .filter((n): n is OnChainRawNotification => Boolean(n));

  return transformedNotifications ?? [];
}

/**
 * Marks the specified notifications as read.
 * This method sends a POST request to the notifications service to mark the provided notification IDs as read.
 * If the operation is successful, it completes without error. If the operation fails, it throws an error with details.
 *
 * @param bearerToken - The JSON Web Token used for authentication in the API call.
 * @param notificationIds - An array of notification IDs to be marked as read.
 * @returns A promise that resolves to void. The promise will reject if there's an error during the API call or if the response status is not 200.
 */
export async function markNotificationsAsRead(
  bearerToken: string,
  notificationIds: string[],
): Promise<void> {
  if (notificationIds.length === 0) {
    return;
  }

  try {
    await makeApiCall(
      bearerToken,
      NOTIFICATION_API_MARK_ALL_AS_READ_ENDPOINT,
      'POST',
      { ids: notificationIds },
    );
  } catch (err) {
    log.error('Error marking notifications as read:', err);
  }
}
