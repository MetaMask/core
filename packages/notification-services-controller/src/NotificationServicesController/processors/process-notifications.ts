import { processAPINotifications } from './process-api-notifications';
import {
  isFeatureAnnouncementRead,
  processFeatureAnnouncement,
} from './process-feature-announcement';
import { processSnapNotification } from './process-snap-notifications';
import {
  TRIGGER_TYPES,
  NOTIFICATION_API_TRIGGER_TYPES_SET,
} from '../constants/notification-schema';
import type { FeatureAnnouncementRawNotification } from '../types/feature-announcement/feature-announcement';
import type {
  INotification,
  RawNotificationUnion,
} from '../types/notification/notification';
import type { NormalisedAPINotification } from '../types/notification-api/notification-api';
import type { RawSnapNotification } from '../types/snaps';

const isOnChainNotification = (
  notification: RawNotificationUnion,
): notification is NormalisedAPINotification =>
  NOTIFICATION_API_TRIGGER_TYPES_SET.has(notification.type);

const isFeatureAnnouncement = (
  notification: RawNotificationUnion,
): notification is FeatureAnnouncementRawNotification =>
  notification.type === TRIGGER_TYPES.FEATURES_ANNOUNCEMENT;

const isSnapNotification = (
  notification: RawNotificationUnion,
): notification is RawSnapNotification =>
  notification.type === TRIGGER_TYPES.SNAP;

/**
 * Process feature announcement and wallet notifications into a shared/normalised notification shape.
 * We can still differentiate notifications by the `type` property
 *
 * @param notification - a feature announcement or on chain notification
 * @param readNotifications - all read notifications currently
 * @returns a processed notification
 */
export function processNotification(
  notification: RawNotificationUnion,
  readNotifications: string[] = [],
): INotification {
  const exhaustedAllCases = (_uncheckedCase: never): never => {
    const type: string = notification?.type;
    throw new Error(`No processor found for notification kind ${type}`);
  };

  if (isFeatureAnnouncement(notification)) {
    const processedNotification = processFeatureAnnouncement(notification);
    processedNotification.isRead = isFeatureAnnouncementRead(
      processedNotification,
      readNotifications,
    );
    return processedNotification;
  }

  if (isSnapNotification(notification)) {
    return processSnapNotification(notification);
  }

  if (isOnChainNotification(notification)) {
    return processAPINotifications(notification);
  }

  return exhaustedAllCases(notification);
}

/**
 * Safe version of processing a notification. Rather than throwing an error if failed to process, it will return the Notification or undefined
 *
 * @param notification - notification to processes
 * @param readNotifications - all read notifications currently
 * @returns a process notification or undefined if failed to process
 */
export function safeProcessNotification(
  notification: RawNotificationUnion,
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

const isNotUndefined = <Item>(item?: Item): item is Item => Boolean(item);
export const processAndFilterNotifications = (
  notifications: RawNotificationUnion[],
  readIds: string[],
): INotification[] =>
  notifications
    .map((notification) => safeProcessNotification(notification, readIds))
    .filter(isNotUndefined);
