import type { FeatureAnnouncementRawNotification } from '../feature-announcement/feature-announcement';
import type { NormalisedAPINotification } from '../notification-api/notification-api';
import type { RawSnapNotification } from '../snaps';
import type { Compute } from '../type-utils';

export type BaseNotification = {
  id: string;
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
