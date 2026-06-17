import type { Types } from '../../NotificationServicesController/index.js';

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
 * Type guard for notifications that carry an API-provided `template` field.
 * In V4 only platform notifications have `template`.
 *
 * @param notification - processed notification.
 * @returns True if the notification has a `template` field.
 */
function hasTemplate(
  notification: Types.INotification,
): notification is NotificationWithTemplate {
  return 'template' in notification;
}

/**
 * Creates a push notification message from the notification's `template` field.
 * Returns null for on-chain notifications (V4 on-chain has no template).
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
