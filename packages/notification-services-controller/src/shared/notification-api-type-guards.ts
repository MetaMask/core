import type {
  UnprocessedRawNotification,
  OnChainNotification,
  PlatformNotification,
} from '../NotificationServicesController/types/notification-api/index.js';

/**
 * Narrows a v4 API notification to an on-chain notification.
 *
 * @param notification - Unprocessed v4 API notification.
 * @returns Whether the notification is an on-chain notification.
 */
export function isOnChainNotification(
  notification: UnprocessedRawNotification,
): notification is OnChainNotification {
  return notification.notification_type === 'wallet_activity';
}

/**
 * Narrows a v4 API notification to a platform notification.
 *
 * @param notification - Unprocessed v4 API notification.
 * @returns Whether the notification is a platform notification.
 */
export function isPlatformNotification(
  notification: UnprocessedRawNotification,
): notification is PlatformNotification {
  return !isOnChainNotification(notification);
}
