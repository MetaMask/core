import type { FeatureAnnouncementRawNotification } from '../types/feature-announcement/feature-announcement';
import type { INotification } from '../types/notification/notification';
/**
 * Checks if a feature announcement should be read.
 * Checks feature announcement state (from param), as well as if the notification is "expired"
 *
 * @param notification - notification to check
 * @param readPlatformNotificationsList - list of read notifications
 * @returns boolean if notification should be marked as read or unread
 */
export declare function isFeatureAnnouncementRead(notification: Pick<INotification, 'id' | 'createdAt'>, readPlatformNotificationsList: string[]): boolean;
/**
 * Processes a feature announcement into a shared/normalised notification shape.
 *
 * @param notification - raw feature announcement
 * @returns a normalised feature announcement
 */
export declare function processFeatureAnnouncement(notification: FeatureAnnouncementRawNotification): INotification;
//# sourceMappingURL=process-feature-announcement.d.ts.map