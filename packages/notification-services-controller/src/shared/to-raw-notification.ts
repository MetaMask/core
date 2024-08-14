import type {
  OnChainRawNotification,
  UnprocessedOnChainRawNotification,
} from 'src/NotificationServicesController/types';

/**
 * A true "raw notification" does not have some fields that exist on this type. E.g. the `type` field.
 * This is retro-actively added when we fetch notifications to be able to easily type-discriminate notifications.
 * We use this to ensure that the correct missing fields are added to the raw shapes
 *
 * @param data - raw onchain notification
 * @returns a complete raw onchain notification
 */
export function toRawOnChainNotification(
  data: UnprocessedOnChainRawNotification,
): OnChainRawNotification {
  return {
    ...data,
    type: data?.data?.kind,
  } as OnChainRawNotification;
}
