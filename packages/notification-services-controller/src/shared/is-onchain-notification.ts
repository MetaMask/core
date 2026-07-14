import type {
  UnprocessedRawNotification,
  OnChainNotification,
} from '../NotificationServicesController/types/notification-api';
import { isOnChainNotification } from './notification-api-type-guards';

/**
 * Checks if the given value is an on-chain notification using the v4 `notification_type` discriminator.
 *
 * @param notification - The value to check.
 * @returns True if the value is an on-chain notification, false otherwise.
 */
export function isOnChainRawNotification(
  notification: unknown,
): notification is OnChainNotification {
  return isOnChainNotification(notification as UnprocessedRawNotification);
}
