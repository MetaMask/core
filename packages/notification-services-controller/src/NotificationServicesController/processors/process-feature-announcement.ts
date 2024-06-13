import type { FeatureAnnouncementRawNotification } from '../types/feature-announcement/feature-announcement';
import type { INotification } from '../types/notification/notification';

const ONE_DAY_MS = 1000 * 60 * 60 * 24;

const shouldAutoExpire = (oldDate: Date) => {
  const differenceInTime = Date.now() - oldDate.getTime();
  const differenceInDays = differenceInTime / ONE_DAY_MS;
  return differenceInDays >= 90;
};

/**
 * Checks if a feature announcement should be read.
 * Checks feature announcement state (from param), as well as if the notification is "expired"
 *
 * @param notification - notification to check
 * @param readPlatformNotificationsList - list of read notifications
 * @returns boolean if notification should be marked as read or unread
 */
export function isFeatureAnnouncementRead(
  notification: Pick<INotification, 'id' | 'createdAt'>,
  readPlatformNotificationsList: string[],
): boolean {
  if (readPlatformNotificationsList.includes(notification.id)) {
    return true;
  }
  return shouldAutoExpire(new Date(notification.createdAt));
}

/**
 * Processes a feature announcement into a shared/normalised notification shape.
 *
 * @param notification - raw feature announcement
 * @returns a normalised feature announcement
 */
export function processFeatureAnnouncement(
  notification: FeatureAnnouncementRawNotification,
): INotification {
  return {
    type: notification.type,
    id: notification.data.id,
    createdAt: new Date(notification.createdAt).toISOString(),
    data: notification.data,
    isRead: false,
  };
}
