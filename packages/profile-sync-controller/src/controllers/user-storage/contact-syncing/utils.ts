import type {
  AddressBookEntry,
  AddressType,
} from '@metamask/address-book-controller';
import { toChecksumHexAddress } from '@metamask/controller-utils';

import { USER_STORAGE_VERSION_KEY, USER_STORAGE_VERSION } from './constants';
import type { UserStorageContactEntry } from './types';

/**
 * Extends AddressBookEntry with sync metadata
 * This is only used internally during the sync process and is not stored in AddressBookController
 */
export type SyncAddressBookEntry = AddressBookEntry & {
  lastUpdatedAt?: number;
  deleted?: boolean;
  deletedAt?: number;
};

/**
 * Map an address book entry to a user storage address book entry
 * Always sets a current timestamp for entries going to remote storage
 *
 * @param addressBookEntry - An address book entry
 * @returns A user storage address book entry
 */
export const mapAddressBookEntryToUserStorageEntry = (
  addressBookEntry: AddressBookEntry,
): UserStorageContactEntry => {
  const { address, name, chainId, memo, addressType } = addressBookEntry;

  // Get sync metadata from the input or use current timestamp if not present
  const syncAddressBookEntry = addressBookEntry as SyncAddressBookEntry;
  const now = Date.now();

  return {
    [USER_STORAGE_VERSION_KEY]: USER_STORAGE_VERSION,
    a: toChecksumHexAddress(address),
    n: name,
    c: chainId,
    ...(memo ? { m: memo } : {}),
    ...(addressType ? { t: addressType } : {}),
    lu: syncAddressBookEntry.lastUpdatedAt || now,
    ...(syncAddressBookEntry.deleted
      ? { d: syncAddressBookEntry.deleted }
      : {}),
    ...(syncAddressBookEntry.deletedAt
      ? { dt: syncAddressBookEntry.deletedAt }
      : {}),
  };
};

/**
 * Map a user storage address book entry to an address book entry
 * Preserves sync metadata from remote storage while keeping the
 * entry compatible with AddressBookController
 *
 * @param userStorageEntry - A user storage address book entry
 * @returns An address book entry with sync metadata for internal use
 */
export const mapUserStorageEntryToAddressBookEntry = (
  userStorageEntry: UserStorageContactEntry,
): SyncAddressBookEntry => {
  // Create a standard AddressBookEntry
  const addressBookEntry: SyncAddressBookEntry = {
    address: toChecksumHexAddress(userStorageEntry.a),
    name: userStorageEntry.n,
    chainId: userStorageEntry.c,
    memo: userStorageEntry.m || '',
    isEns: false, // This will be updated by the AddressBookController
    ...(userStorageEntry.t
      ? { addressType: userStorageEntry.t as AddressType }
      : {}),
  };

  // Include remote metadata for sync operation only (not stored in AddressBookController)
  if (userStorageEntry.d) {
    addressBookEntry.deleted = userStorageEntry.d;
  }

  if (userStorageEntry.dt) {
    addressBookEntry.deletedAt = userStorageEntry.dt;
  }

  if (userStorageEntry.lu) {
    addressBookEntry.lastUpdatedAt = userStorageEntry.lu;
  }

  return addressBookEntry;
};
