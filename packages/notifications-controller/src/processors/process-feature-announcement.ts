import type { FeatureAnnouncementRawNotification } from '../types/feature-announcement/feature-announcement';
import type { Notification as INotification } from '../types/notification/notification';

const ONE_DAY_MS = 1000 * 60 * 60 * 24;

/**
 * Determines if a given date should be automatically expired based on the number of days since the date.
 *
 * @param oldDate - The date to compare against the current date.
 * @returns Returns true if the number of days since the oldDate is greater than or equal to 90, otherwise returns false.
 */
function shouldAutoExpire(oldDate: Date) {
  const differenceInTime = Date.now() - oldDate.getTime();
  const differenceInDays = differenceInTime / ONE_DAY_MS;
  return differenceInDays >= 90;
}

/**
 * Checks if a feature announcement is marked as read.
 *
 * @param notification - The notification object containing the id and createdAt properties.
 * @param readPlatformNotificationsList - The list of read platform notifications.
 * @returns Returns true if the announcement is marked as read, otherwise returns false.
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
 * Processes a feature announcement notification and returns a processed notification object.
 *
 * @param notification - The raw feature announcement notification to process.
 * @returns The processed notification object.
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
