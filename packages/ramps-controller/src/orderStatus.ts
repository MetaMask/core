import { RampsOrderStatus } from './RampsService.js';

/**
 * Order statuses that no longer require polling or in-flow navigation.
 * Shared by the controller and consuming clients so terminal checks stay in sync.
 */
export const TERMINAL_ORDER_STATUSES: ReadonlySet<RampsOrderStatus> = new Set([
  RampsOrderStatus.Completed,
  RampsOrderStatus.Failed,
  RampsOrderStatus.Cancelled,
  RampsOrderStatus.IdExpired,
]);

/**
 * Whether a ramps order has reached a terminal status.
 *
 * @param status - The order status to test.
 * @returns Whether the status is terminal.
 */
export function isTerminalOrderStatus(status: RampsOrderStatus): boolean {
  return TERMINAL_ORDER_STATUSES.has(status);
}

/**
 * Order statuses that are still in progress and may be polled.
 */
export const PENDING_ORDER_STATUSES: ReadonlySet<RampsOrderStatus> = new Set([
  RampsOrderStatus.Pending,
  RampsOrderStatus.Created,
  RampsOrderStatus.Unknown,
  RampsOrderStatus.Precreated,
]);
