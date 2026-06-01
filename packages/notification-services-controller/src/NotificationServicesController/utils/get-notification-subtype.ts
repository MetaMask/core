import { TRIGGER_TYPES } from '../constants/notification-schema';
import type { INotification } from '../types/notification/notification';

/**
 * Derives the normalised `notification_subtype` for a processed in-app
 * notification. This is the team-owned axis (e.g. `eth_received`) and is
 * always derivable from an `INotification`, so every consumer (both clients)
 * pulls it from one place rather than recomputing a fallback chain.
 *
 * - on-chain: the trigger kind (`payload.data.kind`, e.g. `eth_received`).
 * - snap: the snap notification type (`snap`, already snake_case).
 * - feature-announcement: §5.3 calls for a stable per-campaign id, pending
 *   confirmation from the announcements team that one exists. Until confirmed,
 *   we use the `features_announcement` label as the single value.
 * - platform: the server-set `notification_subtype`. The backend stores it
 *   (notify-notification-services §4.3), but the `/api/v3/notifications` inbox
 *   response does not expose it yet, so it is absent from the generated
 *   `schema.ts` and we fall back to `type` (`platform`).
 *
 * @param notification - a processed in-app notification.
 * @returns the normalised subtype string.
 */
export function getNotificationSubtype(notification: INotification): string {
  switch (notification.type) {
    case TRIGGER_TYPES.FEATURES_ANNOUNCEMENT:
      // §5.3 calls for a stable per-campaign id here, pending confirmation from
      // the announcements team that one exists. Until confirmed, use the
      // `features_announcement` label as the single value.
      return TRIGGER_TYPES.FEATURES_ANNOUNCEMENT;
    case TRIGGER_TYPES.SNAP:
      // Snap notification type, already snake_case in the existing shape.
      return TRIGGER_TYPES.SNAP;
    default:
      // On-chain: the trigger kind (e.g. `eth_received`).
      if (notification.notification_type === 'on-chain') {
        return notification.payload.data.kind;
      }
      // Platform: §5.3 wants the server-set `notification_subtype`. It is
      // stored backend-side (§4.3) but not returned on the `/api/v3/notifications`
      // inbox response, so it is absent from `schema.ts`. Fall back to `type`
      // (`platform`) until the inbox API exposes it.
      // TODO: return notification.notification_subtype once the inbox API
      // response includes it (needs a notify-notification-services change).
      return notification.type;
  }
}
