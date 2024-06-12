import { TRIGGER_TYPES } from '../constants/notification-schema';
import type { FeatureAnnouncementRawNotification } from '../types/feature-announcement/feature-announcement';
import type {
  INotification,
  NotificationUnion,
} from '../types/notification/notification';
import type { OnChainRawNotification } from '../types/on-chain-notification/on-chain-notification';
import {
  isFeatureAnnouncementRead,
  processFeatureAnnouncement,
} from './process-feature-announcement';
import { processOnChainNotification } from './process-onchain-notifications';

const isOnChainNotification = (
  n: NotificationUnion,
): n is OnChainRawNotification => Object.values(TRIGGER_TYPES).includes(n.type);

const isFeatureAnnouncement = (
  n: NotificationUnion,
): n is FeatureAnnouncementRawNotification =>
  n.type === TRIGGER_TYPES.FEATURES_ANNOUNCEMENT;

/**
 * Process feature announcement and wallet notifications into a shared/normalised notification shape.
 * We can still differentiate notifications by the `type` property
 *
 * @param notification - a feature announcement or on chain notification
 * @param readNotifications - all read notifications currently
 * @returns a processed notification
 */
export function processNotification(
  notification: NotificationUnion,
  readNotifications: string[] = [],
): INotification {
  const exhaustedAllCases = (_: never) => {
    const type: string = notification?.type;
    throw new Error(`No processor found for notification kind ${type}`);
  };

  if (isFeatureAnnouncement(notification)) {
    const n = processFeatureAnnouncement(
      notification as FeatureAnnouncementRawNotification,
    );
    n.isRead = isFeatureAnnouncementRead(n, readNotifications);
    return n;
  }

  if (isOnChainNotification(notification)) {
    return processOnChainNotification(notification as OnChainRawNotification);
  }

  return exhaustedAllCases(notification as never);
}

/**
 * Safe version of processing a notification. Rather than throwing an error if failed to process, it will return the Notification or undefined
 *
 * @param notification - notification to processes
 * @param readNotifications - all read notifications currently
 * @returns a process notification or undefined if failed to process
 */
export function safeProcessNotification(
  notification: NotificationUnion,
  readNotifications: string[] = [],
): INotification | undefined {
  try {
    const processedNotification = processNotification(
      notification,
      readNotifications,
    );
    return processedNotification;
  } catch {
    return undefined;
  }
}
