import { SDK } from '@metamask/profile-sync-controller';

import {
  USER_STORAGE_GROUPS_FEATURE_KEY,
  USER_STORAGE_WALLETS_FEATURE_ENTRY_KEY,
  USER_STORAGE_WALLETS_FEATURE_KEY,
} from './constants';
import {
  formatWalletForUserStorageUsage,
  formatGroupForUserStorageUsage,
  parseWalletFromUserStorageResponse,
  parseGroupFromUserStorageResponse,
  parseLegacyAccountFromUserStorageResponse,
} from './format-utils';
import { executeWithRetry } from './network-utils';
import type { AccountGroupMultichainAccountObject } from '../../group';
import { backupAndSyncLogger } from '../../logger';
import type { AccountWalletEntropyObject } from '../../wallet';
import type {
  BackupAndSyncContext,
  LegacyUserStorageSyncedAccount,
  UserStorageSyncedWallet,
  UserStorageSyncedWalletGroup,
} from '../types';

/**
 * Retrieves the wallet from user storage.
 *
 * @param context - The backup and sync context.
 * @param entropySourceId - The entropy source ID.
 * @returns The wallet from user storage or null if not found or invalid.
 * @throws When network operations fail after maximum retry attempts.
 * @throws When messenger calls to UserStorageController fail due to authentication errors, encryption/decryption failures, or network issues.
 */
export const getWalletFromUserStorage = async (
  context: BackupAndSyncContext,
  entropySourceId: string,
): Promise<UserStorageSyncedWallet | null> => {
  return executeWithRetry(async () => {
    const walletData = await context.messenger.call(
      'UserStorageController:performGetStorage',
      `${USER_STORAGE_WALLETS_FEATURE_KEY}.${USER_STORAGE_WALLETS_FEATURE_ENTRY_KEY}`,
      entropySourceId,
    );
    if (!walletData) {
      return null;
    }

    try {
      backupAndSyncLogger(
        `Retrieved wallet data from user storage: ${JSON.stringify(walletData)}`,
      );
      return parseWalletFromUserStorageResponse(walletData);
    } catch (error) {
      backupAndSyncLogger(
        `Failed to parse wallet data from user storage: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  });
};

/**
 * Pushes the wallet to user storage.
 *
 * @param context - The backup and sync context.
 * @param wallet - The wallet to push to user storage.
 * @returns A promise that resolves when the operation is complete.
 * @throws When network operations fail after maximum retry attempts.
 * @throws When messenger calls to UserStorageController fail due to authentication errors, encryption/decryption failures, or network issues.
 * @throws When JSON.stringify fails on the formatted wallet data.
 */
export const pushWalletToUserStorage = async (
  context: BackupAndSyncContext,
  wallet: AccountWalletEntropyObject,
): Promise<void> => {
  return executeWithRetry(async () => {
    const formattedWallet = formatWalletForUserStorageUsage(context, wallet);
    const stringifiedWallet = JSON.stringify(formattedWallet);
    const entropySourceId = wallet.metadata.entropy.id;

    backupAndSyncLogger(`Pushing wallet to user storage: ${stringifiedWallet}`);

    return await context.messenger.call(
      'UserStorageController:performSetStorage',
      `${USER_STORAGE_WALLETS_FEATURE_KEY}.${USER_STORAGE_WALLETS_FEATURE_ENTRY_KEY}`,
      stringifiedWallet,
      entropySourceId,
    );
  });
};

/**
 * Retrieves all groups from user storage.
 *
 * @param context - The backup and sync context.
 * @param entropySourceId - The entropy source ID.
 * @returns An array of groups from user storage.
 * @throws When network operations fail after maximum retry attempts.
 * @throws When messenger calls to UserStorageController fail due to authentication errors, encryption/decryption failures, or network issues.
 */
export const getAllGroupsFromUserStorage = async (
  context: BackupAndSyncContext,
  entropySourceId: string,
): Promise<UserStorageSyncedWalletGroup[]> => {
  return executeWithRetry(async () => {
    const groupData = await context.messenger.call(
      'UserStorageController:performGetStorageAllFeatureEntries',
      `${USER_STORAGE_GROUPS_FEATURE_KEY}`,
      entropySourceId,
    );
    if (!groupData) {
      return [];
    }

    const allGroups = groupData
      .map((groupStringifiedJSON) => {
        try {
          return parseGroupFromUserStorageResponse(groupStringifiedJSON);
        } catch (error) {
          backupAndSyncLogger(
            `Failed to parse group data from user storage: ${error instanceof Error ? error.message : String(error)}`,
          );
          return null;
        }
      })
      .filter((group): group is UserStorageSyncedWalletGroup => group !== null);

    backupAndSyncLogger(
      `Retrieved groups from user storage: ${JSON.stringify(allGroups)}`,
    );

    return allGroups;
  });
};

/**
 * Retrieves a single group from user storage by group index.
 *
 * @param context - The backup and sync context.
 * @param entropySourceId - The entropy source ID.
 * @param groupIndex - The group index to retrieve.
 * @returns The group from user storage or null if not found or invalid.
 * @throws When network operations fail after maximum retry attempts.
 * @throws When messenger calls to UserStorageController fail due to authentication errors, encryption/decryption failures, or network issues.
 */
export const getGroupFromUserStorage = async (
  context: BackupAndSyncContext,
  entropySourceId: string,
  groupIndex: number,
): Promise<UserStorageSyncedWalletGroup | null> => {
  return executeWithRetry(async () => {
    const groupData = await context.messenger.call(
      'UserStorageController:performGetStorage',
      `${USER_STORAGE_GROUPS_FEATURE_KEY}.${groupIndex}`,
      entropySourceId,
    );
    if (!groupData) {
      return null;
    }

    try {
      return parseGroupFromUserStorageResponse(groupData);
    } catch (error) {
      backupAndSyncLogger(
        `Failed to parse group data from user storage: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  });
};

/**
 * Pushes a group to user storage.
 *
 * @param context - The backup and sync context.
 * @param group - The group to push to user storage.
 * @param entropySourceId - The entropy source ID.
 * @returns A promise that resolves when the operation is complete.
 * @throws When network operations fail after maximum retry attempts.
 * @throws When messenger calls to UserStorageController fail due to authentication errors, encryption/decryption failures, or network issues.
 * @throws When JSON.stringify fails on the formatted group data.
 */
export const pushGroupToUserStorage = async (
  context: BackupAndSyncContext,
  group: AccountGroupMultichainAccountObject,
  entropySourceId: string,
): Promise<void> => {
  return executeWithRetry(async () => {
    const formattedGroup = formatGroupForUserStorageUsage(context, group);
    const stringifiedGroup = JSON.stringify(formattedGroup);

    backupAndSyncLogger(`Pushing group to user storage: ${stringifiedGroup}`);

    return await context.messenger.call(
      'UserStorageController:performSetStorage',
      `${USER_STORAGE_GROUPS_FEATURE_KEY}.${formattedGroup.groupIndex}`,
      stringifiedGroup,
      entropySourceId,
    );
  });
};

/**
 * Pushes a batch of groups to user storage.
 *
 * @param context - The backup and sync context.
 * @param groups - The groups to push to user storage.
 * @param entropySourceId - The entropy source ID.
 * @returns A promise that resolves when the operation is complete.
 * @throws When network operations fail after maximum retry attempts.
 * @throws When messenger calls to UserStorageController fail due to authentication errors, encryption/decryption failures, or network issues.
 * @throws When JSON.stringify fails on any of the formatted group data.
 */
export const pushGroupToUserStorageBatch = async (
  context: BackupAndSyncContext,
  groups: AccountGroupMultichainAccountObject[],
  entropySourceId: string,
): Promise<void> => {
  return executeWithRetry(async () => {
    const formattedGroups = groups.map((group) =>
      formatGroupForUserStorageUsage(context, group),
    );

    const entries: [string, string][] = formattedGroups.map((group) => [
      String(group.groupIndex),
      JSON.stringify(group),
    ]);

    backupAndSyncLogger(
      `Pushing groups to user storage: ${entries.map(([_, value]) => value).join(', ')}`,
    );

    return await context.messenger.call(
      'UserStorageController:performBatchSetStorage',
      USER_STORAGE_GROUPS_FEATURE_KEY,
      entries,
      entropySourceId,
    );
  });
};

/**
 * Retrieves legacy user storage accounts for a specific entropy source ID.
 *
 * @param context - The backup and sync context.
 * @param entropySourceId - The entropy source ID to retrieve data for.
 * @returns A promise that resolves with the legacy user storage accounts.
 * @throws When network operations fail after maximum retry attempts.
 * @throws When messenger calls to UserStorageController fail due to authentication errors, encryption/decryption failures, or network issues.
 */
export const getAllLegacyUserStorageAccounts = async (
  context: BackupAndSyncContext,
  entropySourceId: string,
): Promise<LegacyUserStorageSyncedAccount[]> => {
  return executeWithRetry(async () => {
    const accountsData = await context.messenger.call(
      'UserStorageController:performGetStorageAllFeatureEntries',
      SDK.USER_STORAGE_FEATURE_NAMES.accounts,
      entropySourceId,
    );

    if (!accountsData) {
      return [];
    }

    const allAccounts = accountsData
      .map((stringifiedAccount) => {
        try {
          return parseLegacyAccountFromUserStorageResponse(stringifiedAccount);
        } catch (error) {
          backupAndSyncLogger(
            `Failed to parse legacy account data from user storage: ${error instanceof Error ? error.message : String(error)}`,
          );
          return null;
        }
      })
      .filter(
        (account): account is LegacyUserStorageSyncedAccount =>
          account !== null,
      );

    backupAndSyncLogger(
      `Retrieved legacy accounts from user storage: ${JSON.stringify(allAccounts)}`,
    );

    return allAccounts;
  });
};
