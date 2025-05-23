import type { ContactSyncingOptions } from './types';

/**
 * Check if we can perform contact syncing
 *
 * @param options - parameters used for checking if we can perform contact syncing
 * @returns whether we can perform contact syncing
 */
export function canPerformContactSyncing(
  options: ContactSyncingOptions,
): boolean {
  const { getMessenger, getUserStorageControllerInstance } = options;

  const {
    isBackupAndSyncEnabled,
    isContactSyncingEnabled,
    isContactSyncingInProgress,
  } = getUserStorageControllerInstance().state;
  const isAuthEnabled = getMessenger().call(
    'AuthenticationController:isSignedIn',
  );

  if (
    !isBackupAndSyncEnabled ||
    !isContactSyncingEnabled ||
    isContactSyncingInProgress ||
    !isAuthEnabled
  ) {
    return false;
  }

  return true;
}
