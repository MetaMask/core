import { v4 as uuid } from 'uuid';

import { type INotification } from '../types';
import type { RawSnapNotification } from '../types/snaps';

/**
 * Processes a snap notification into a normalized shape.
 *
 * @param snapNotification - A raw snap notification.
 * @returns a normalized snap notification.
 */
export const processSnapNotification = (
  snapNotification: RawSnapNotification,
): INotification => {
  const { data, type } = snapNotification;
  return {
    id: uuid(),
    createdAt: new Date().toISOString(),
    isRead: false,
    type,
    data,
  };
};
