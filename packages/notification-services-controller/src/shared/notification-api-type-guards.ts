import type {
  Notification,
  OnChainNotification,
  PlatformNotification,
} from '../NotificationServicesController/types/notification-api';

/**
 * Narrows a v4 API notification to an on-chain notification.
 */
export function isOnChainNotification(
  notification: Notification,
): notification is OnChainNotification {
  return notification.notification_type === 'wallet_activity';
}

/**
 * Narrows a v4 API notification to a platform notification.
 */
export function isPlatformNotification(
  notification: Notification,
): notification is PlatformNotification {
  return !isOnChainNotification(notification);
}
