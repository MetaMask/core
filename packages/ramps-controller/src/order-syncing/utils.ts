import type { RampsOrder } from '../RampsService';
import { USER_STORAGE_VERSION, USER_STORAGE_VERSION_KEY } from './constants';
import type { SyncRampsOrder, UserStorageRampsOrderEntry } from './types';

/**
 * Creates a unique storage key for a ramps order.
 * Mirrors {@link getInternalOrderCode} without importing the controller module
 * (avoids circular dependencies).
 *
 * @param order - Order fields used to derive the internal order code.
 * @returns Storage entry key under the rampsOrders feature.
 */
export function createOrderStorageKey(
  order: Pick<RampsOrder, 'id' | 'providerOrderId'>,
): string {
  const { id, providerOrderId } = order;
  if (id?.includes('/orders/')) {
    return id.split('/orders/')[1];
  }
  return providerOrderId?.trim() ?? '';
}

/**
 * Whether an order has the minimum fields required for syncing.
 *
 * @param order - The order to validate.
 * @returns True when the order can be synced.
 */
export function isSyncableOrder(
  order: Pick<RampsOrder, 'id' | 'providerOrderId'>,
): boolean {
  return Boolean(
    order.providerOrderId?.trim() ||
    (order.id?.includes('/orders/') && order.id.split('/orders/')[1]),
  );
}

/**
 * Maps a ramps order (with optional sync metadata) to a User Storage entry.
 *
 * @param order - The order to map.
 * @returns A User Storage entry ready to be JSON-stringified.
 */
export function mapRampsOrderToUserStorageEntry(
  order: SyncRampsOrder,
): UserStorageRampsOrderEntry {
  const { lastUpdatedAt, deletedAt, ...rampsOrder } = order;
  const now = Date.now();

  return {
    [USER_STORAGE_VERSION_KEY]: USER_STORAGE_VERSION,
    o: rampsOrder,
    lu: lastUpdatedAt ?? now,
    ...(deletedAt ? { dt: deletedAt } : {}),
  };
}

/**
 * Maps a User Storage entry back to a sync-aware ramps order.
 *
 * @param entry - The User Storage entry.
 * @returns A {@link SyncRampsOrder} for merge logic.
 */
export function mapUserStorageEntryToRampsOrder(
  entry: UserStorageRampsOrderEntry,
): SyncRampsOrder {
  return {
    ...entry.o,
    ...(entry.lu ? { lastUpdatedAt: entry.lu } : {}),
    ...(entry.dt ? { deletedAt: entry.dt } : {}),
  };
}

/**
 * Strips sync metadata for equality checks and remote payload shaping.
 *
 * @param order - Order that may include sync metadata.
 * @returns A plain {@link RampsOrder} without sync fields.
 */
export function stripSyncMetadata(order: SyncRampsOrder): RampsOrder {
  const {
    lastUpdatedAt: _lastUpdatedAt,
    deletedAt: _deletedAt,
    ...rampsOrder
  } = order;
  return rampsOrder;
}

/**
 * Strips remote tombstone metadata while preserving `lastUpdatedAt` so local
 * controller state can participate in last-write-wins conflict resolution.
 *
 * @param order - Order that may include sync metadata.
 * @returns Order safe to persist locally (no `deletedAt`).
 */
export function stripDeletedAt(order: SyncRampsOrder): SyncRampsOrder {
  const { deletedAt: _deletedAt, ...rampsOrder } = order;
  return rampsOrder;
}

/**
 * Deep-compares two ramps orders by JSON serialization of their order bodies
 * (sync metadata excluded).
 *
 * @param a - First order.
 * @param b - Second order.
 * @returns True when the order payloads are equal.
 */
export function areOrdersEqual(
  a: SyncRampsOrder | RampsOrder,
  b: SyncRampsOrder | RampsOrder,
): boolean {
  return (
    JSON.stringify(stripSyncMetadata(a as SyncRampsOrder)) ===
    JSON.stringify(stripSyncMetadata(b as SyncRampsOrder))
  );
}
