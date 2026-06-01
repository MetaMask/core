// First-class analytics fields mirror the snake_case keys written into the FCM
// payload by push-services and the Segment schema, so this type intentionally
// uses snake_case rather than the camelCase domain convention.
/* eslint-disable @typescript-eslint/naming-convention */

/**
 * First-class push notification fields carried by the
 * `NotificationServicesPushController` messenger events
 * (`onNewNotifications` and `pushNotificationClicked`).
 *
 * These are read directly from the top-level FCM payload keys written by
 * push-services, so clients construct their Segment events from this payload
 * directly — no nested fallback chains, no JSON-parsing of a `metadata` blob.
 *
 * `profile_id` is belt-and-braces: clients should still prefer their own
 * `AuthenticationController` reading for the canonical "current user", but the
 * FCM-supplied value lets us cross-check server vs. client and survives
 * auth-controller-not-yet-ready races.
 */
export type PushAnalyticsPayload = {
  notification_id: string;
  /** Free-form snake_case label set by the producer. */
  notification_type: string;
  /** Team-owned, open-ended (e.g. `eth_received`). */
  notification_subtype: string;
  /** Server-side fallback; clients prefer their own AuthController source. */
  profile_id?: string;
  /** Only present when the notification has a chain context. */
  chain_id?: number;
  /** Platform notifications only; the CTA link to route to on tap. */
  deeplink?: string;
};
