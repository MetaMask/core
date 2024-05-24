import type { Notification as INotification } from '../types/notification/notification';
import type { OnChainRawNotification } from '../types/on-chain-notification/on-chain-notification';

/**
 * Processes an on-chain notification and returns a shared notification object.
 *
 * @param notification - The raw on-chain notification to process.
 * @returns The processed notification object.
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
