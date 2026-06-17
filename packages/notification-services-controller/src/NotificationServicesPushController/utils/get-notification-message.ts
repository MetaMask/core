import { Constants } from '../../NotificationServicesController';
import type { Types } from '../../NotificationServicesController';

type PushNotificationMessage = {
  title: string;
  description: string;
  ctaLink?: string;
};

type NotificationWithTemplate = Extract<
  Types.INotification,
  { template: unknown }
>;

/**
 * Type guard for notifications that carry an API-provided `template` field
 * (on-chain and platform notifications).
 *
 * @param notification - processed notification.
 * @returns True if the notification has a `template` field.
 */
function hasTemplate(
  notification: Types.INotification,
): notification is NotificationWithTemplate {
  return Constants.NOTIFICATION_API_TRIGGER_TYPES_SET.has(notification.type);
}

/**
 * Creates a push notification message based on the given on-chain raw notification.
 *
 * Title, description, and optional CTA link are sourced from the notification's
 * `template` field provided by the notification API.
 *
 * @param notification - processed notification.
 * @returns The push notification message object, or null if the notification has no template.
 */
export function createOnChainPushNotificationMessage(
  notification: Types.INotification,
): PushNotificationMessage | null {
  if (!notification?.type || !hasTemplate(notification)) {
    return null;
  }

  const { template } = notification;

  return {
    title: template.title ?? '',
    description: template.body ?? '',
    ...(template.cta?.link ? { ctaLink: template.cta.link } : {}),
  };
}
