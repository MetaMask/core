import type { FeatureAnnouncementRawNotification } from '../feature-announcement/feature-announcement.js';
import type { NormalisedAPINotification } from '../notification-api/notification-api.js';
import type { RawSnapNotification } from '../snaps/index.js';
import type { Compute } from '../type-utils.js';

export type BaseNotification = {
  id: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  notification_subtype: string;
  createdAt: string;
  isRead: boolean;
};

export type RawNotificationUnion =
  | NormalisedAPINotification
  | FeatureAnnouncementRawNotification
  | RawSnapNotification;

/**
 * The shape of a "generic" notification.
 * Other than the fields listed below, tt will also contain:
 * - `type` field (declared in the Raw shapes)
 * - `data` field (declared in the Raw shapes)
 */
export type INotification = Compute<
  | (FeatureAnnouncementRawNotification & BaseNotification)
  | (NormalisedAPINotification & BaseNotification)
  | (RawSnapNotification & BaseNotification & { readDate?: string | null })
>;

export type MarkAsReadNotificationsParam = Pick<
  INotification,
  'id' | 'type' | 'isRead'
>[];
