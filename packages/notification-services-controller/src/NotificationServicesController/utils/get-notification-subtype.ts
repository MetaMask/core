import { TRIGGER_TYPES } from '../constants/notification-schema';
import type { INotification } from '../types/notification/notification';

/**
 * Derives the normalised `notification_subtype` for a processed in-app
 * notification. This is the team-owned axis (e.g. `eth_received`) and is
 * always derivable from an `INotification`, so every consumer (both clients)
 * pulls it from one place rather than recomputing a fallback chain.
 *
 * - on-chain: the trigger kind (already stored on `type`, e.g. `eth_received`).
 * - snap: the snap notification type (`snap`, already snake_case).
 * - feature-announcement: a stable label. There is no per-campaign id in the
 *   current shape, so we use `features_announcement` until/if the announcements
 *   team backfills per-campaign ids.
 * - platform: the server-set `notification_subtype` carried through from the
 *   platform API. Until that field lands in the API schema, we fall back to
 *   `type` (`platform`).
 *
 * @param notification - a processed in-app notification.
 * @returns the normalised subtype string.
 */
export function getNotificationSubtype(notification: INotification): string {
  switch (notification.type) {
    case TRIGGER_TYPES.FEATURES_ANNOUNCEMENT:
      return TRIGGER_TYPES.FEATURES_ANNOUNCEMENT;
    case TRIGGER_TYPES.SNAP:
      return TRIGGER_TYPES.SNAP;
    default:
      // On-chain notifications store the trigger kind on `type`; platform
      // notifications store `platform`.
      return notification.type;
  }
}
