// snake_case mirrors the FCM payload and Segment schema keys
/* eslint-disable @typescript-eslint/naming-convention */

/**
 * Analytics fields carried by the `NotificationServicesPushController` messenger
 * events (`onNewNotifications`, `pushNotificationClicked`). Read directly from
 * top-level FCM payload keys, so clients build Segment events without fallback
 * chains or parsing a `metadata` blob.
 */
export type PushAnalyticsPayload = {
  notification_id: string;
  /** Free-form snake_case label set by the producer. */
  notification_type: string;
  /** Team-owned, open-ended (e.g. `eth_received`). */
  notification_subtype: string;
  /** Only present when the notification has a chain context. */
  chain_id?: number;
  /** Platform notifications only; the CTA link to route to on tap. */
  deeplink?: string;
};
