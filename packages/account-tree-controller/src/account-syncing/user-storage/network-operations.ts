import type { AccountGroupMultichainAccountObject } from 'src/group';
import type { AccountWalletEntropyObject } from 'src/wallet';

import {
  formatWalletForUserStorageUsage,
  formatGroupForUserStorageUsage,
  parseWalletFromUserStorageResponse,
  parseGroupFromUserStorageResponse,
} from './format';
import { executeWithRetry } from './network-utils';
import {
  USER_STORAGE_GROUPS_FEATURE_KEY,
  USER_STORAGE_WALLETS_FEATURE_ENTRY_KEY,
  USER_STORAGE_WALLETS_FEATURE_KEY,
} from '../constants';
import type {
  AccountSyncingContext,
  UserStorageSyncedWallet,
  UserStorageSyncedWalletGroup,
} from '../types';

// Wallet operations
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

export const pushWalletToUserStorage = async (
  context: AccountSyncingContext,
  wallet: AccountWalletEntropyObject,
): Promise<void> => {
  return executeWithRetry(async () => {
    const formattedWallet = formatWalletForUserStorageUsage(wallet);
    const entropySourceId = wallet.metadata.entropy.id;

    return await context.messenger.call(
      'UserStorageController:performSetStorage',
      `${USER_STORAGE_WALLETS_FEATURE_KEY}.${USER_STORAGE_WALLETS_FEATURE_ENTRY_KEY}`,
      JSON.stringify(formattedWallet),
      entropySourceId,
    );
  }, `Push wallet ${wallet.id} to user storage`);
};

// Group operations
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

export const pushGroupToUserStorage = async (
  context: AccountSyncingContext,
  group: AccountGroupMultichainAccountObject,
): Promise<void> => {
  return executeWithRetry(async () => {
    const formattedGroup = formatGroupForUserStorageUsage(group);
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

export const pushGroupToUserStorageBatch = async (
  context: AccountSyncingContext,
  groups: AccountGroupMultichainAccountObject[],
  entropySourceId: string,
): Promise<void> => {
  return executeWithRetry(async () => {
    const formattedGroups = groups.map(formatGroupForUserStorageUsage);
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
