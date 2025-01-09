import type { UserStorageControllerMessenger } from '../UserStorageController';
import type UserStorageController from '../UserStorageController';
import type {
  USER_STORAGE_VERSION_KEY,
  USER_STORAGE_VERSION,
} from './constants';

export type UserStorageAccount = {
  /**
   * The Version 'v' of the User Storage.
   * NOTE - will allow us to support upgrade/downgrades in the future
   */
  [USER_STORAGE_VERSION_KEY]: typeof USER_STORAGE_VERSION;
  /** the id 'i' of the account */
  i: string;
  /** the address 'a' of the account */
  a: string;
  /** the name 'n' of the account */
  n: string;
  /** the nameLastUpdatedAt timestamp 'nlu' of the account */
  nlu?: number;
};

export type AccountSyncingConfig = {
  isAccountSyncingEnabled: boolean;
};

export type AccountSyncingOptions = {
  getUserStorageControllerInstance: () => UserStorageController;
  getMessenger: () => UserStorageControllerMessenger;
};
