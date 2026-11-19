import type { PushAnalyticsPayload } from '../types/index.js';

/**
 * Builds the first-class push analytics payload from the top-level FCM `data`
 * keys written by push-services. Returns `null` when the required identity
 * fields are missing (e.g. a malformed or legacy payload), so callers can
 * safely bail out.
 *
 * @param data - the top-level FCM `data` map (all values are strings).
 * @returns the analytics payload, or `null` if required fields are absent.
 */
export function toPushAnalyticsPayload(
  data: Record<string, string> | undefined,
): PushAnalyticsPayload | null {
  if (!data?.notification_id || !data?.notification_type) {
    return null;
  }

  return {
    notification_id: data.notification_id,
    notification_type: data.notification_type,
    notification_subtype: data.notification_subtype ?? '',
    chain_id: data.chain_id ? Number(data.chain_id) : undefined,
    deeplink: data.deeplink || undefined,
  };
}
