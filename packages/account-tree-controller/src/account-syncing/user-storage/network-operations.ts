import type { AccountGroupMultichainAccountObject } from 'src/group';
import type { AccountWalletEntropyObject } from 'src/wallet';

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
import type {
  AccountSyncingContext,
  UserStorageSyncedWallet,
  UserStorageSyncedWalletGroup,
} from '../types';

/**
 * Retrieves the wallet from user storage.
 *
 * @param context - The account syncing context.
 * @param entropySourceId - The entropy source ID.
 * @returns The wallet from user storage or null if not found.
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

    return parseWalletFromUserStorageResponse(walletData);
  }, `Get wallet ${entropySourceId} from user storage`);
};

/**
 * Pushes the wallet to user storage.
 *
 * @param context - The account syncing context.
 * @param wallet - The wallet to push to user storage.
 * @returns A promise that resolves when the operation is complete.
 */
export const pushWalletToUserStorage = async (
  context: AccountSyncingContext,
  wallet: AccountWalletEntropyObject,
): Promise<void> => {
  return executeWithRetry(async () => {
    const formattedWallet = formatWalletForUserStorageUsage(context, wallet);
    const entropySourceId = wallet.metadata.entropy.id;

    return await context.messenger.call(
      'UserStorageController:performSetStorage',
      `${USER_STORAGE_WALLETS_FEATURE_KEY}.${USER_STORAGE_WALLETS_FEATURE_ENTRY_KEY}`,
      JSON.stringify(formattedWallet),
      entropySourceId,
    );
  }, `Push wallet ${wallet.id} to user storage`);
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

    return groupData.map((groupStringifiedJSON) =>
      parseGroupFromUserStorageResponse(groupStringifiedJSON),
    );
  }, `Get groups for wallet ${entropySourceId} from user storage`);
};

/**
 * Pushes a group to user storage.
 *
 * @param context - The account syncing context.
 * @param group - The group to push to user storage.
 * @returns A promise that resolves when the operation is complete.
 */
export const pushGroupToUserStorage = async (
  context: AccountSyncingContext,
  group: AccountGroupMultichainAccountObject,
): Promise<void> => {
  return executeWithRetry(async () => {
    const formattedGroup = formatGroupForUserStorageUsage(context, group);
    // entropySourceId can be derived from the group ID, assuming it follows a specific format.
    // Group ID looks like: `entropy:${string}/${string}`
    const entropySourceId = group.id.split('/')[0].replace('entropy:', '');

    return await context.messenger.call(
      'UserStorageController:performSetStorage',
      `${USER_STORAGE_GROUPS_FEATURE_KEY}.${formattedGroup.groupIndex}`,
      JSON.stringify(formattedGroup),
      entropySourceId,
    );
  }, `Push group ${group.id} to user storage`);
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
  }, `Push groups for wallet ${entropySourceId} to user storage`);
};
