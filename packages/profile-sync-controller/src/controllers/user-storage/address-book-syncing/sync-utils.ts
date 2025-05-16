import type { AddressBookSyncingOptions } from './types';

/**
 * Check if we can perform address book syncing
 *
 * @param options - parameters used for checking if we can perform address book syncing
 * @returns whether we can perform address book syncing
 */
export function canPerformAddressBookSyncing(
  options: AddressBookSyncingOptions,
): boolean {
  const { getMessenger, getUserStorageControllerInstance } = options;

  const {
    isProfileSyncingEnabled,
    isAddressBookSyncingEnabled
  } = getUserStorageControllerInstance().state;
  const isAuthEnabled = getMessenger().call(
    'AuthenticationController:isSignedIn',
  );

  if (
    !isProfileSyncingEnabled ||
    !isAddressBookSyncingEnabled ||
    !isAuthEnabled
  ) {
    return false;
  }

  return true;
}
