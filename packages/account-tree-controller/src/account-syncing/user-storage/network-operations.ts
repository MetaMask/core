import type { AccountGroupMultichainAccountObject } from 'src/group';
import type { AccountTreeControllerMessenger } from 'src/types';
import type { AccountWalletEntropyObject } from 'src/wallet';

import {
  formatWalletForUserStorageUsage,
  formatGroupForUserStorageUsage,
  parseWalletFromUserStorageResponse,
  parseGroupFromUserStorageResponse,
} from './format';
import {
  USER_STORAGE_GROUPS_FEATURE_KEY,
  USER_STORAGE_WALLETS_FEATURE_ENTRY_KEY,
  USER_STORAGE_WALLETS_FEATURE_KEY,
} from '../constants';
import type {
  UserStorageSyncedWallet,
  UserStorageSyncedWalletGroup,
} from '../types';

// Wallet operations
export const getWalletFromUserStorage = async (
  messenger: AccountTreeControllerMessenger,
  entropySourceId: string,
): Promise<UserStorageSyncedWallet | null> => {
  const walletData = await messenger.call(
    'UserStorageController:performGetStorage',
    `${USER_STORAGE_WALLETS_FEATURE_KEY}.${USER_STORAGE_WALLETS_FEATURE_ENTRY_KEY}`,
    entropySourceId,
  );
  if (!walletData) {
    return null;
  }

  return parseWalletFromUserStorageResponse(walletData);
};

export const pushWalletToUserStorage = async (
  wallet: AccountWalletEntropyObject,
  messenger: AccountTreeControllerMessenger,
): Promise<void> => {
  const formattedWallet = formatWalletForUserStorageUsage(wallet);
  const entropySourceId = wallet.metadata.entropy.id;

  await messenger.call(
    'UserStorageController:performSetStorage',
    `${USER_STORAGE_WALLETS_FEATURE_KEY}.${USER_STORAGE_WALLETS_FEATURE_ENTRY_KEY}`,
    JSON.stringify(formattedWallet),
    entropySourceId,
  );
};

// Group operations
export const getAllGroupsFromUserStorage = async (
  messenger: AccountTreeControllerMessenger,
  entropySourceId: string,
): Promise<UserStorageSyncedWalletGroup[]> => {
  const groupData = await messenger.call(
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
};

export const pushGroupToUserStorage = async (
  group: AccountGroupMultichainAccountObject,
  messenger: AccountTreeControllerMessenger,
): Promise<void> => {
  const formattedGroup = formatGroupForUserStorageUsage(group);
  // entropySourceId can be derived from the group ID, assuming it follows a specific format.
  // Group ID looks like: `entropy:${string}/${string}`
  const entropySourceId = group.id.split('/')[0].replace('entropy:', '');

  await messenger.call(
    'UserStorageController:performSetStorage',
    `${USER_STORAGE_GROUPS_FEATURE_KEY}.${formattedGroup.groupIndex}`,
    JSON.stringify(formattedGroup),
    entropySourceId,
  );
};

export const pushGroupToUserStorageBatch = async (
  groups: AccountGroupMultichainAccountObject[],
  messenger: AccountTreeControllerMessenger,
  entropySourceId: string,
): Promise<void> => {
  const formattedGroups = groups.map(formatGroupForUserStorageUsage);
  const entries: [string, string][] = formattedGroups.map((group) => [
    String(group.groupIndex),
    JSON.stringify(group),
  ]);

  return await messenger.call(
    'UserStorageController:performBatchSetStorage',
    USER_STORAGE_GROUPS_FEATURE_KEY,
    entries,
    entropySourceId,
  );
};
