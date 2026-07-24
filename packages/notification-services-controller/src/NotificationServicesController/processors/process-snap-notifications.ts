import { v4 as uuid } from 'uuid';

import type { INotification } from '../types/index.js';
import type { RawSnapNotification } from '../types/snaps/index.js';
import { getNotificationSubtype } from '../utils/get-notification-subtype.js';

/**
 * Processes a snap notification into a normalized shape.
 *
 * @param snapNotification - A raw snap notification.
 * @returns a normalized snap notification.
 */
export const processSnapNotification = (
  snapNotification: RawSnapNotification,
): INotification => {
  const { data, type, readDate } = snapNotification;
  return {
    id: uuid(),
    notification_subtype: getNotificationSubtype(snapNotification),
    readDate,
    createdAt: new Date().toISOString(),
    isRead: false,
    type,
    data,
  };
};
