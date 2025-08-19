import { assert, StructError } from '@metamask/superstruct';

import type {
  UserStorageSyncedWallet,
  UserStorageSyncedWalletGroup,
} from '../types';
import {
  UserStorageSyncedWalletSchema,
  UserStorageSyncedWalletGroupSchema,
} from '../types';

/**
 * Validates and asserts user storage wallet data, throwing detailed errors if invalid.
 *
 * @param walletData - The wallet data from user storage to validate.
 * @throws StructError if the wallet data is invalid.
 */
export function assertValidUserStorageWallet(
  walletData: unknown,
): asserts walletData is UserStorageSyncedWallet {
  try {
    assert(walletData, UserStorageSyncedWalletSchema);
  } catch (error) {
    if (error instanceof StructError) {
      const validationFailures = error
        .failures()
        .map(({ path, message }) => `[${path.join('.')}] ${message}`)
        .join(', ');
      throw new Error(
        `Invalid user storage wallet data: ${validationFailures}`,
      );
    }
    throw error;
  }
}

/**
 * Validates and asserts user storage group data, throwing detailed errors if invalid.
 *
 * @param groupData - The group data from user storage to validate.
 * @throws StructError if the group data is invalid.
 */
export function assertValidUserStorageGroup(
  groupData: unknown,
): asserts groupData is UserStorageSyncedWalletGroup {
  try {
    assert(groupData, UserStorageSyncedWalletGroupSchema);
  } catch (error) {
    if (error instanceof StructError) {
      const validationFailures = error
        .failures()
        .map(({ path, message }) => `[${path.join('.')}] ${message}`)
        .join(', ');
      throw new Error(`Invalid user storage group data: ${validationFailures}`);
    }
    throw error;
  }
}
