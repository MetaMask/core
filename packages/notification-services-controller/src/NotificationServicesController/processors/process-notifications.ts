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
  n: RawNotificationUnion,
): n is NormalisedAPINotification =>
  NOTIFICATION_API_TRIGGER_TYPES_SET.has(n.type);

const isFeatureAnnouncement = (
  n: RawNotificationUnion,
): n is FeatureAnnouncementRawNotification =>
  n.type === TRIGGER_TYPES.FEATURES_ANNOUNCEMENT;

const isSnapNotification = (
  n: RawNotificationUnion,
): n is RawSnapNotification => n.type === TRIGGER_TYPES.SNAP;

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

  if (isSnapNotification(notification)) {
    return processSnapNotification(notification);
  }

  if (isOnChainNotification(notification)) {
    return processAPINotifications(notification);
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

const isNotUndefined = <Item>(t?: Item): t is Item => Boolean(t);
export const processAndFilterNotifications = (
  ns: RawNotificationUnion[],
  readIds: string[],
) => ns.map((n) => safeProcessNotification(n, readIds)).filter(isNotUndefined);
