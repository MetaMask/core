/**
 * User Storage feature key for V2 ramps orders.
 * Each order is stored as a separate entry under this feature.
 */
export const USER_STORAGE_RAMPS_ORDERS_FEATURE = 'rampsOrders';

/**
 * Key for version in User Storage schema.
 */
export const USER_STORAGE_VERSION_KEY = 'v';

/**
 * Current version of the ramps order User Storage schema.
 */
export const USER_STORAGE_VERSION = '1';

/**
 * Trace names for ramps order syncing operations.
 */
export const TraceName = {
  RampsOrderSyncFull: 'Ramps Order Sync Full',
  RampsOrderSyncSaveBatch: 'Ramps Order Sync Save Batch',
  RampsOrderSyncUpdateRemote: 'Ramps Order Sync Update Remote',
  RampsOrderSyncDeleteRemote: 'Ramps Order Sync Delete Remote',
} as const;
