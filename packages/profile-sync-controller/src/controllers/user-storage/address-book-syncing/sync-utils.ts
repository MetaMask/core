import type { AddressBookEntry } from '@metamask/address-book-controller';

import { ADDRESS_BOOK_FEATURE_NAME } from './constants';
import type { AddressBookSyncingOptions, UserStorageAddressBookEntry } from './types';
import { mapUserStorageEntryToAddressBookEntry } from './utils';

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
    isAccountSyncingEnabled,
    isAccountSyncingInProgress,
  } = getUserStorageControllerInstance().state;
  const isAuthEnabled = getMessenger().call(
    'AuthenticationController:isSignedIn',
  );

  if (
    !isProfileSyncingEnabled ||
    !isAccountSyncingEnabled ||
    !isAuthEnabled ||
    isAccountSyncingInProgress
  ) {
    return false;
  }

  return true;
}
