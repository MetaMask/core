import type {
  UnprocessedRawNotification,
  NormalisedAPINotification,
  OnChainRawNotification,
  PlatformRawNotification,
} from 'src/NotificationServicesController/types/notification-api';

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
  const exhaustedAllCases = (_: never): never => {
    const type: string = data?.notification_type;
    throw new Error(
      `toRawAPINotification - No processor found for notification kind ${type}`,
    );
  };

  if (data.notification_type === 'on-chain') {
    if (!data?.payload?.data?.kind) {
      throw new Error(
        'toRawAPINotification - No kind found for on-chain notification',
      );
    }
    return {
      ...data,
      type: data.payload.data.kind,
    } as OnChainRawNotification;
  }

  if (data.notification_type === 'platform') {
    return {
      ...data,
      type: data.notification_type,
    } as PlatformRawNotification;
  }

  return exhaustedAllCases(data);
}
