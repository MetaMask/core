import { v4 as uuid } from 'uuid';

import type { INotification } from '../types/notification/index.js';
import type { RawSnapNotification } from '../types/snaps/index.js';

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
    readDate,
    createdAt: new Date().toISOString(),
    isRead: false,
    type,
    data,
  };
};
