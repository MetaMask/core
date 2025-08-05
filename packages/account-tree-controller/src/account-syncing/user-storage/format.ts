import type { AccountGroupObject } from 'src/group';
import type { AccountWalletObject } from 'src/wallet';

import type {
  UserStorageSyncedWallet,
  UserStorageSyncedWalletGroup,
} from '../types';

export const formatWalletForUserStorageUsage = (
  wallet: AccountWalletObject,
): UserStorageSyncedWallet => {
  return {
    ...wallet.metadata,
  };
};

export const formatGroupForUserStorageUsage = (
  group: AccountGroupObject,
): UserStorageSyncedWalletGroup => {
  return {
    ...group.metadata,
    // Update this logic once the groupIndex is exposed in the group object.
    // For now, here's a clunky way to get the index, based on export type AccountGroupId = `${AccountWalletId}/${string}`;
    groupIndex: Number(group.id.split('/')[1]) || 0,
  };
};

export const parseWalletFromUserStorage = (
  wallet: string,
): UserStorageSyncedWallet => {
  try {
    const walletData = JSON.parse(wallet) as UserStorageSyncedWallet;
    return walletData;
  } catch (error: unknown) {
    throw new Error(
      `Invalid wallet metadata format: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};
export const parseGroupFromUserStorage = (
  group: string,
): UserStorageSyncedWalletGroup => {
  try {
    const groupData = JSON.parse(group);
    return groupData;
  } catch (error: unknown) {
    throw new Error(
      `Invalid group metadata format: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};
