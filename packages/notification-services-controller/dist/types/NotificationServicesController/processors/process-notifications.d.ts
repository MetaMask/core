import type { INotification, NotificationUnion } from '../types/notification/notification';
/**
 * Process feature announcement and wallet notifications into a shared/normalised notification shape.
 * We can still differentiate notifications by the `type` property
 *
 * @param notification - a feature announcement or on chain notification
 * @param readNotifications - all read notifications currently
 * @returns a processed notification
 */
export declare function processNotification(notification: NotificationUnion, readNotifications?: string[]): INotification;
/**
 * Safe version of processing a notification. Rather than throwing an error if failed to process, it will return the Notification or undefined
 *
 * @param notification - notification to processes
 * @param readNotifications - all read notifications currently
 * @returns a process notification or undefined if failed to process
 */
export declare function safeProcessNotification(notification: NotificationUnion, readNotifications?: string[]): INotification | undefined;
//# sourceMappingURL=process-notifications.d.ts.map