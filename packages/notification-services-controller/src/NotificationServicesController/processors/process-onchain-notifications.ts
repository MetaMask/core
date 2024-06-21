import type { INotification } from '../types/notification/notification';
import type { OnChainRawNotification } from '../types/on-chain-notification/on-chain-notification';

/**
 * Processes On-Chain notifications to a normalized notification
 *
 * @param notification - On-Chain Notification
 * @returns Normalized Notification
 */
export function processOnChainNotification(
  notification: OnChainRawNotification,
): INotification {
  return {
    ...notification,
    id: notification.id,
    createdAt: new Date(notification.created_at).toISOString(),
    isRead: !notification.unread,
  };
}
