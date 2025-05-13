import type { Hex } from '@metamask/utils';
import type {
  USER_STORAGE_VERSION_KEY,
  USER_STORAGE_VERSION,
} from './constants';
import type { UserStorageControllerMessenger } from '../UserStorageController';
import type UserStorageController from '../UserStorageController';

export type UserStorageAddressBookEntry = {
  /**
   * The Version 'v' of the User Storage.
   * NOTE - will allow us to support upgrade/downgrades in the future
   */
  [USER_STORAGE_VERSION_KEY]: typeof USER_STORAGE_VERSION;
  /** the address 'a' of the contact */
  a: string;
  /** the name 'n' of the contact */
  n: string;
  /** the chainId 'c' of the contact */
  c: Hex;
  /** the memo 'm' of the contact (optional) */
  m?: string;
  /** the addressType 't' of the contact (optional) */
  t?: string;
  /** the lastUpdatedAt timestamp 'lu' of the contact */
  lu?: number;
};

/**
 * Options for address book syncing operations
 */
export type AddressBookSyncingOptions = {
  getUserStorageControllerInstance: () => UserStorageController;
  getMessenger: () => UserStorageControllerMessenger;
}
