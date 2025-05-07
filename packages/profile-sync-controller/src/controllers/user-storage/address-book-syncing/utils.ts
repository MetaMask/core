import type { AddressBookEntry, AddressType } from '@metamask/address-book-controller';
import { toChecksumHexAddress } from '@metamask/controller-utils';

import {
  USER_STORAGE_VERSION_KEY,
  USER_STORAGE_VERSION,
} from './constants';
import type { UserStorageAddressBookEntry } from './types';

/**
 * Map an address book entry to a user storage address book entry
 *
 * @param addressBookEntry - An address book entry
 * @returns A user storage address book entry
 */
export const mapAddressBookEntryToUserStorageEntry = (
  addressBookEntry: AddressBookEntry,
): UserStorageAddressBookEntry => {
  const { address, name, chainId, memo, addressType } = addressBookEntry;
  
  return {
    [USER_STORAGE_VERSION_KEY]: USER_STORAGE_VERSION,
    a: toChecksumHexAddress(address),
    n: name,
    c: chainId,
    ...(memo ? { m: memo } : {}),
    ...(addressType ? { t: addressType } : {}),
    lu: Date.now(),
  };
};

/**
 * Map a user storage address book entry to an address book entry
 *
 * @param userStorageEntry - A user storage address book entry
 * @returns An address book entry
 */
export const mapUserStorageEntryToAddressBookEntry = (
  userStorageEntry: UserStorageAddressBookEntry,
): AddressBookEntry => {
  return {
    address: toChecksumHexAddress(userStorageEntry.a),
    name: userStorageEntry.n,
    chainId: userStorageEntry.c,
    memo: userStorageEntry.m || '',
    isEns: false, // This will be updated by the AddressBookController
    ...(userStorageEntry.t ? { addressType: userStorageEntry.t as AddressType } : {}),
  };
}; 