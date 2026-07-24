import type { NormalisedAPINotification } from '../types/notification-api/notification-api.js';
import type { INotification } from '../types/notification/notification.js';
import { getNotificationSubtype } from '../utils/get-notification-subtype.js';
import { shouldAutoExpire } from '../utils/should-auto-expire.js';

/**
 * Processes API notifications to a normalized INotification shape
 *
 * @param notification - API Notification (On-Chain or Platform Notification)
 * @returns Normalized Notification
 */
export function processAPINotifications(
  notification: NormalisedAPINotification,
): INotification {
  const createdAtDate = new Date(notification.created_at);
  const expired = shouldAutoExpire(createdAtDate);

  return {
    ...notification,
    id: notification.id,
    notification_subtype: getNotificationSubtype(notification),
    createdAt: createdAtDate.toISOString(),
    isRead: expired || !notification.unread,
  };
}
