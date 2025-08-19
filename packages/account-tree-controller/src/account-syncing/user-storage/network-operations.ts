import { USER_STORAGE_FEATURE_NAMES } from '@metamask/profile-sync-controller/sdk';

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
} from './format-utils';
import { executeWithRetry } from './network-utils';
import type { AccountGroupMultichainAccountObject } from '../../group';
import type { AccountWalletEntropyObject } from '../../wallet';
import type {
  AccountSyncingContext,
  UserStorageSyncedWallet,
  UserStorageSyncedWalletGroup,
  UserStorageWalletExtendedMetadata,
} from '../types';

/**
 * Retrieves the wallet from user storage.
 *
 * @param context - The account syncing context.
 * @param entropySourceId - The entropy source ID.
 * @returns The wallet from user storage or null if not found or invalid.
 */
export const getWalletFromUserStorage = async (
  context: AccountSyncingContext,
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
      return parseWalletFromUserStorageResponse(walletData);
    } catch (error) {
      if (context.enableDebugLogging) {
        console.warn(
          `Failed to parse wallet data from user storage: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return null;
    }
  });
};

/**
 * Pushes the wallet to user storage.
 *
 * @param context - The account syncing context.
 * @param wallet - The wallet to push to user storage.
 * @param extendedMetadata - Optional extended metadata to include in the wallet.
 * @returns A promise that resolves when the operation is complete.
 */
export const pushWalletToUserStorage = async (
  context: AccountSyncingContext,
  wallet: AccountWalletEntropyObject,
  extendedMetadata?: UserStorageWalletExtendedMetadata,
): Promise<void> => {
  return executeWithRetry(async () => {
    const formattedWallet = formatWalletForUserStorageUsage(
      context,
      wallet,
      extendedMetadata,
    );
    const entropySourceId = wallet.metadata.entropy.id;

    return await context.messenger.call(
      'UserStorageController:performSetStorage',
      `${USER_STORAGE_WALLETS_FEATURE_KEY}.${USER_STORAGE_WALLETS_FEATURE_ENTRY_KEY}`,
      JSON.stringify(formattedWallet),
      entropySourceId,
    );
  });
};

/**
 * Retrieves all groups from user storage.
 *
 * @param context - The account syncing context.
 * @param entropySourceId - The entropy source ID.
 * @returns An array of groups from user storage.
 */
export const getAllGroupsFromUserStorage = async (
  context: AccountSyncingContext,
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

    return groupData
      .map((groupStringifiedJSON) => {
        try {
          return parseGroupFromUserStorageResponse(groupStringifiedJSON);
        } catch (error) {
          if (context.enableDebugLogging) {
            console.warn(
              `Failed to parse group data from user storage: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
          return null;
        }
      })
      .filter((group): group is UserStorageSyncedWalletGroup => group !== null);
  });
};

/**
 * Retrieves a single group from user storage by group index.
 *
 * @param context - The account syncing context.
 * @param entropySourceId - The entropy source ID.
 * @param groupIndex - The group index to retrieve.
 * @returns The group from user storage or null if not found or invalid.
 */
export const getGroupFromUserStorage = async (
  context: AccountSyncingContext,
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
      if (context.enableDebugLogging) {
        console.warn(
          `Failed to parse group data from user storage: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return null;
    }
  });
};

/**
 * Pushes a group to user storage.
 *
 * @param context - The account syncing context.
 * @param group - The group to push to user storage.
 * @param entropySourceId - The entropy source ID.
 * @returns A promise that resolves when the operation is complete.
 */
export const pushGroupToUserStorage = async (
  context: AccountSyncingContext,
  group: AccountGroupMultichainAccountObject,
  entropySourceId: string,
): Promise<void> => {
  return executeWithRetry(async () => {
    const formattedGroup = formatGroupForUserStorageUsage(context, group);

    return await context.messenger.call(
      'UserStorageController:performSetStorage',
      `${USER_STORAGE_GROUPS_FEATURE_KEY}.${formattedGroup.groupIndex}`,
      JSON.stringify(formattedGroup),
      entropySourceId,
    );
  });
};

/**
 * Pushes a batch of groups to user storage.
 *
 * @param context - The account syncing context.
 * @param groups - The groups to push to user storage.
 * @param entropySourceId - The entropy source ID.
 * @returns A promise that resolves when the operation is complete.
 */
export const pushGroupToUserStorageBatch = async (
  context: AccountSyncingContext,
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

    return await context.messenger.call(
      'UserStorageController:performBatchSetStorage',
      USER_STORAGE_GROUPS_FEATURE_KEY,
      entries,
      entropySourceId,
    );
  });
};

/**
 * Retrieves legacy user storage data for a specific entropy source ID.
 *
 * @param context - The account syncing context.
 * @param entropySourceId - The entropy source ID to retrieve data for.
 * @returns A promise that resolves with the legacy user storage data.
 */
export const getLegacyUserStorageData = async (
  context: AccountSyncingContext,
  entropySourceId: string,
): Promise<
  {
    a: string;
    n: string;
    nlu: number;
  }[]
> => {
  return executeWithRetry(async () => {
    const rawAccountsListResponse = await context.messenger.call(
      'UserStorageController:performGetStorageAllFeatureEntries',
      USER_STORAGE_FEATURE_NAMES.accounts,
      entropySourceId,
    );

    return (
      rawAccountsListResponse?.map(
        (rawAccount) =>
          JSON.parse(rawAccount) as {
            a: string;
            n: string;
            nlu: number;
          },
      ) ?? []
    );
  });
};
