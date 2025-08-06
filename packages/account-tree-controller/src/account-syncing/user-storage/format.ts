import type { AccountGroupMultichainAccountObject } from 'src/group';
import type { AccountWalletEntropyObject } from 'src/wallet';

import type {
  AccountSyncingContext,
  UserStorageSyncedWallet,
  UserStorageSyncedWalletGroup,
} from '../types';

export const formatWalletForUserStorageUsage = (
  context: AccountSyncingContext,
  wallet: AccountWalletEntropyObject,
): UserStorageSyncedWallet => {
  const persistedWalletMetadata =
    context.controller.state.accountWalletsMetadata[wallet.id];
  return {
    name: persistedWalletMetadata.name,
  };
};

export const formatGroupForUserStorageUsage = (
  context: AccountSyncingContext,
  group: AccountGroupMultichainAccountObject,
): UserStorageSyncedWalletGroup => {
  const persistedGroupMetadata =
    context.controller.state.accountGroupsMetadata[group.id];
  return {
    name: persistedGroupMetadata.name,
    groupIndex: group.metadata.entropy.groupIndex,
  };
};

export const parseWalletFromUserStorageResponse = (
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
export const parseGroupFromUserStorageResponse = (
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
