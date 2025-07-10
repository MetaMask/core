export const BACKUPANDSYNC_FEATURES = {
  main: 'main',
  accountSyncing: 'accountSyncing',
  contactSyncing: 'contactSyncing',
} as const;

/**
 * Trace names for UserStorage syncing operations
 */
export const TraceName = {
  // Contact syncing traces
  ContactSyncFull: 'Contact Sync Full',
  ContactSyncSaveBatch: 'Contact Sync Save Batch',
  ContactSyncUpdateRemote: 'Contact Sync Update Remote',
  ContactSyncDeleteRemote: 'Contact Sync Delete Remote',

  // Account syncing traces
  AccountSyncFull: 'Account Sync Full',
  AccountSyncSaveIndividual: 'Account Sync Save Individual',
} as const;
