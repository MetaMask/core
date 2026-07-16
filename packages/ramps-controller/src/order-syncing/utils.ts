import type { RampsOrder } from '../RampsService';
import { USER_STORAGE_VERSION, USER_STORAGE_VERSION_KEY } from './constants';
import type { SyncRampsOrder, UserStorageRampsOrderEntry } from './types';

/**
 * Creates a unique storage key for a ramps order.
 * Mirrors {@link getInternalOrderCode} without importing the controller module
 * (avoids circular dependencies).
 *
 * Prefers a non-empty `/orders/<code>` suffix; otherwise falls back to a trimmed
 * `providerOrderId`. An empty `/orders/` segment does not win over a real
 * provider order id.
 *
 * @param order - Order fields used to derive the internal order code.
 * @returns Storage entry key under the rampsOrders feature.
 */
export function createOrderStorageKey(
  order: Pick<RampsOrder, 'id' | 'providerOrderId'>,
): string {
  const { id, providerOrderId } = order;
  if (id?.includes('/orders/')) {
    const code = id.split('/orders/')[1]?.trim();
    if (code) {
      return code;
    }
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
  return createOrderStorageKey(order).length > 0;
}

/**
 * Strips bank-transfer / PII-heavy payment details before persisting to User
 * Storage. Local controller state may still keep `paymentDetails`.
 *
 * @param order - Order that may include payment details.
 * @returns Order body safe for remote sync payloads.
 */
export function stripPaymentDetailsForRemoteStorage(
  order: RampsOrder,
): RampsOrder {
  const { paymentDetails: _paymentDetails, ...safeOrder } = order;
  return safeOrder;
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
    o: stripPaymentDetailsForRemoteStorage(rampsOrder),
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
 * JSON-stringifies values with object keys sorted so equality is stable across
 * key insertion order.
 *
 * @param value - Value to serialize.
 * @returns Stable JSON string.
 */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, nested) => {
    if (
      nested &&
      typeof nested === 'object' &&
      !Array.isArray(nested) &&
      !(nested instanceof Date)
    ) {
      const record = nested as Record<string, unknown>;
      return Object.keys(record)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = record[key];
          return acc;
        }, {});
    }
    return nested;
  });
}

/**
 * Deep-compares two ramps orders by stable JSON serialization of their order
 * bodies (sync metadata excluded).
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
    stableStringify(stripSyncMetadata(a as SyncRampsOrder)) ===
    stableStringify(stripSyncMetadata(b as SyncRampsOrder))
  );
}
