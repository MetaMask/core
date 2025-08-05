import type { AccountGroupMultichainAccountObject } from 'src/group';
import type { AccountWalletEntropyObject } from 'src/wallet';

import type {
  UserStorageSyncedWallet,
  UserStorageSyncedWalletGroup,
} from '../types';

export const formatWalletForUserStorageUsage = (
  wallet: AccountWalletEntropyObject,
): UserStorageSyncedWallet => {
  return {
    name: wallet.metadata.name,
  };
};

export const formatGroupForUserStorageUsage = (
  group: AccountGroupMultichainAccountObject,
): UserStorageSyncedWalletGroup => {
  return {
    name: group.metadata.name,
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
