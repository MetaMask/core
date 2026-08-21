/**
 * User Storage feature key for MoonPay Enterprise autoramp accounts.
 * Each autoramp is stored as a separate entry under this feature.
 */
export const USER_STORAGE_RAMPS_AUTORAMPS_FEATURE = 'rampsAutoramps';

/**
 * Key for version in User Storage schema.
 */
export const USER_STORAGE_VERSION_KEY = 'v';

/**
 * Current version of the autoramp User Storage schema.
 */
export const USER_STORAGE_VERSION = '1';

/**
 * Trace names for autoramp syncing operations.
 */
export const TraceName = {
  AutorampSyncFull: 'Ramps Autoramp Sync Full',
  AutorampSyncSaveBatch: 'Ramps Autoramp Sync Save Batch',
  AutorampSyncUpdateRemote: 'Ramps Autoramp Sync Update Remote',
  AutorampSyncDeleteRemote: 'Ramps Autoramp Sync Delete Remote',
} as const;
