import { TRIGGER_TYPES } from '../../NotificationServicesController/constants/notification-schema.js';
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

function hasTemplate(
  notification: Types.INotification,
): notification is NotificationWithTemplate {
  // TODO: add more notification.type checks for other notifications unless we add template to all of them
  return notification.type === TRIGGER_TYPES.PLATFORM;
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
