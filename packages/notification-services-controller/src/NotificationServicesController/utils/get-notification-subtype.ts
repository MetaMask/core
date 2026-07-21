import { isOnChainRawNotification } from '../../shared/is-onchain-notification';
import { TRIGGER_TYPES } from '../constants/notification-schema';
import type { RawNotificationUnion } from '../types/notification/notification';

/**
 * Derives the normalised `notification_subtype` for a processed in-app
 * notification. This is the team-owned axis (e.g. `eth_received`) and is
 * always derivable from an `INotification`, so every consumer (both clients)
 * pulls it from one place rather than recomputing a fallback chain.
 *
 * - on-chain: the trigger kind (`payload.data.kind`, e.g. `eth_received`).
 * - platform: the server-set `notification_subtype` from the inbox API.
 * - everything else (snap, feature-announcement): the top-level `type`
 *   (`snap` / `features_announcement`).
 *
 * @param notification - a raw or processed notification.
 * @returns the normalised subtype string.
 */
export function getNotificationSubtype(
  notification: RawNotificationUnion,
): string {
  // On-chain: the trigger kind (e.g. `eth_received`).
  if (isOnChainRawNotification(notification)) {
    return notification.payload.data.kind;
  }

  // Platform: the server-set `notification_subtype` from the inbox API.
  if (notification.type === TRIGGER_TYPES.PLATFORM) {
    return notification.notification_subtype;
  }

  // Fallback (snap, feature-announcement): the top-level `type`.
  return notification.type;
}
