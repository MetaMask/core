import type { OnChainRawNotification } from '../NotificationServicesController';

/**
 * Checks if the given value is an OnChainRawNotification object.
 *
 * @param n - The value to check.
 * @returns True if the value is an OnChainRawNotification object, false otherwise.
 */
export function isOnChainRawNotification(
  n: unknown,
): n is OnChainRawNotification {
  const assumed = n as OnChainRawNotification;

  // We don't have a validation/parsing library to check all possible types of an on chain notification
  // It is safe enough just to check "some" fields, and catch any errors down the line if the shape is bad.
  const isValidEnoughToBeOnChainNotification = [
    assumed?.id,
    assumed?.data,
    assumed?.trigger_id,
  ].every((field) => field !== undefined);
  return isValidEnoughToBeOnChainNotification;
}
