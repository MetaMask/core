import type {
  UnprocessedRawNotification,
  NormalisedAPINotification,
  OnChainRawNotification,
  PlatformRawNotification,
} from 'src/NotificationServicesController/types/notification-api';

import { TRIGGER_TYPES } from '../NotificationServicesController/constants/notification-schema.js';
import { isOnChainNotification } from './notification-api-type-guards.js';

/**
 * A true "raw notification" does not have some fields that exist on this type. E.g. the `type` field.
 * This is retro-actively added when we fetch notifications to be able to easily type-discriminate notifications.
 * We use this to ensure that the correct missing fields are added to the raw shapes
 *
 * @param data - raw onchain notification
 * @returns a complete raw onchain notification
 */
export function toRawAPINotification(
  data: UnprocessedRawNotification,
): NormalisedAPINotification {
  if (isOnChainNotification(data)) {
    if (!data.payload.data?.kind) {
      throw new Error(
        'toRawAPINotification - No kind found for on-chain notification',
      );
    }
    return {
      ...data,
      type: data.payload.data.kind,
    } as OnChainRawNotification;
  }

  return {
    ...data,
    type: TRIGGER_TYPES.PLATFORM,
  } as PlatformRawNotification;
}
