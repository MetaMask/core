import { TRIGGER_TYPES } from '../constants/notification-schema';
import type { FeatureAnnouncementRawNotification } from '../types/feature-announcement/feature-announcement';
import type { Notification as INotification } from '../types/notification/notification';
import type { OnChainRawNotification } from '../types/on-chain-notification/on-chain-notification';
import {
  isFeatureAnnouncementRead,
  processFeatureAnnouncement,
} from './process-feature-announcement';
import { processOnChainNotification } from './process-onchain-notifications';

const isOnChainNotification = (
  n: OnChainRawNotification,
): n is OnChainRawNotification => Object.values(TRIGGER_TYPES).includes(n.type);

/**
 * Processes a notification and returns a processed notification object.
 *
 * @param notification - The notification to process.
 * @param [readNotifications] - The list of read notifications.
 * @returns The processed notification object.
 * @throws {Error} If no processor is found for the notification kind.
 */
export function processNotification(
  notification: FeatureAnnouncementRawNotification | OnChainRawNotification,
  readNotifications: string[] = [],
): INotification {
  const exhaustedAllCases = (_: never) => {
    throw new Error(
      `No processor found for notification kind ${notification.type}`,
    );
  };

  if (notification.type === TRIGGER_TYPES.FEATURES_ANNOUNCEMENT) {
    const n = processFeatureAnnouncement(
      notification as FeatureAnnouncementRawNotification,
    );
    n.isRead = isFeatureAnnouncementRead(n, readNotifications);
    return n;
  }

  if (isOnChainNotification(notification as OnChainRawNotification)) {
    return processOnChainNotification(notification as OnChainRawNotification);
  }

  return exhaustedAllCases(notification as never);
}
