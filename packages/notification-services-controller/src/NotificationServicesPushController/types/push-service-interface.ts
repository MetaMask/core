import type { PushNotificationEnv } from '.';

type Unsubscribe = () => void;

/**
 * Firebase - allows creating of a registration token for push notifications
 */
export type CreateRegToken = (
  env: PushNotificationEnv,
) => Promise<string | null>;

/**
 * Firebase - allows deleting a reg token. Returns true if successful, otherwise false if failed
 */
export type DeleteRegToken = (env: PushNotificationEnv) => Promise<boolean>;

/**
 * Firebase + Platform Specific Logic.
 * Will be used to subscribe to the `onMessage` and `onBackgroundMessage` handlers
 * But will also need client specific logic for showing a notification and clicking a notification
 * (browser APIs for web, and Notifee on mobile)
 *
 * We can either create "creator"/"builder" function in platform specific files (see push-web.ts),
 * Or the platform needs to correctly handle:
 * - subscriptions
 * - click events
 * - publishing PushController events using it's messenger
 */
export type SubscribeToPushNotifications = (
  env: PushNotificationEnv,
) => Promise<Unsubscribe | null>;

export type PushService = {
  createRegToken: CreateRegToken;

  deleteRegToken: DeleteRegToken;

  subscribeToPushNotifications: SubscribeToPushNotifications;
};
