import { assert, StructError } from '@metamask/superstruct';

import type {
  LegacyUserStorageSyncedAccount,
  UserStorageSyncedWallet,
  UserStorageSyncedWalletGroup,
} from '../types';
import {
  UserStorageSyncedWalletSchema,
  UserStorageSyncedWalletGroupSchema,
  LegacyUserStorageSyncedAccountSchema,
} from '../types';

/**
 * Formats validation error messages for user storage data.
 *
 * @param error - The StructError thrown during validation.
 * @returns A formatted string of validation error messages.
 */
const formatValidationErrorMessages = (error: StructError) => {
  const validationFailures = error
    .failures()
    .map(({ path, message }) => `[${path.join('.')}] ${message}`)
    .join(', ');
  return `Invalid user storage data: ${validationFailures}`;
};

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
      throw new Error(
        `Invalid user storage wallet data: ${formatValidationErrorMessages(error)}`,
      );
    }
    /* istanbul ignore next */
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
      throw new Error(
        `Invalid user storage group data: ${formatValidationErrorMessages(error)}`,
      );
    }
    /* istanbul ignore next */
    throw error;
  }
}

/**
 * Validates and asserts legacy user storage account data, throwing detailed errors if invalid.
 *
 * @param accountData - The account data from user storage to validate.
 * @throws StructError if the account data is invalid.
 */
export function assertValidLegacyUserStorageAccount(
  accountData: unknown,
): asserts accountData is LegacyUserStorageSyncedAccount {
  try {
    assert(accountData, LegacyUserStorageSyncedAccountSchema);
  } catch (error) {
    if (error instanceof StructError) {
      throw new Error(
        `Invalid legacy user storage account data: ${formatValidationErrorMessages(error)}`,
      );
    }
    /* istanbul ignore next */
    throw error;
  }
}
