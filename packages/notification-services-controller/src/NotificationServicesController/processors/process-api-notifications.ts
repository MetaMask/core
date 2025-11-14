import type { INotification } from '../types/notification/notification';
import type { NormalisedAPINotification } from '../types/notification-api/notification-api';
import { shouldAutoExpire } from '../utils/should-auto-expire';

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
    createdAt: createdAtDate.toISOString(),
    isRead: expired || !notification.unread,
  };
}
