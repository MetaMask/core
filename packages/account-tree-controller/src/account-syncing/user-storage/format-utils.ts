import {
  assertValidUserStorageWallet,
  assertValidUserStorageGroup,
} from './validation';
import type { AccountGroupMultichainAccountObject } from '../../group';
import type { AccountWalletEntropyObject } from '../../wallet';
import type {
  AccountSyncingContext,
  UserStorageSyncedWallet,
  UserStorageSyncedWalletGroup,
  UserStorageWalletExtendedMetadata,
} from '../types';

/**
 * Formats the wallet for user storage usage.
 * This function extracts the necessary metadata from the wallet
 * and formats it according to the user storage requirements.
 *
 * @param context - The account syncing context.
 * @param wallet - The wallet object to format.
 * @param extendedMetadata - Optional extended metadata to include in the formatted wallet.
 * @returns The formatted wallet for user storage.
 */
export const formatWalletForUserStorageUsage = (
  context: AccountSyncingContext,
  wallet: AccountWalletEntropyObject,
  extendedMetadata?: UserStorageWalletExtendedMetadata,
): UserStorageSyncedWallet => {
  const persistedWalletMetadata =
    context.controller.state.accountWalletsMetadata[wallet.id];
  return {
    name: persistedWalletMetadata.name,
    ...extendedMetadata,
  };
};

/**
 * Formats the group for user storage usage.
 * This function extracts the necessary metadata from the group
 * and formats it according to the user storage requirements.
 *
 * @param context - The account syncing context.
 * @param group - The group object to format.
 * @returns The formatted group for user storage.
 */
export const formatGroupForUserStorageUsage = (
  context: AccountSyncingContext,
  group: AccountGroupMultichainAccountObject,
): UserStorageSyncedWalletGroup => {
  const persistedGroupMetadata =
    context.controller.state.accountGroupsMetadata[group.id];
  return {
    name: persistedGroupMetadata.name,
    hidden: persistedGroupMetadata.hidden,
    pinned: persistedGroupMetadata.pinned,
    groupIndex: group.metadata.entropy.groupIndex,
  };
};

/**
 * Parses the wallet from user storage response.
 * This function attempts to parse the wallet data from a string format
 * and returns it as a UserStorageSyncedWallet object.
 *
 * @param wallet - The wallet data in string format.
 * @returns The parsed UserStorageSyncedWallet object.
 * @throws If the wallet data is not in valid JSON format or fails validation.
 */
export const parseWalletFromUserStorageResponse = (
  wallet: string,
): UserStorageSyncedWallet => {
  try {
    const walletData = JSON.parse(wallet);
    assertValidUserStorageWallet(walletData);
    return walletData;
  } catch (error: unknown) {
    throw new Error(
      `Error trying to parse wallet from user storage response: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

/**
 * Parses the group from user storage response.
 * This function attempts to parse the group data from a string format
 * and returns it as a UserStorageSyncedWalletGroup object.
 *
 * @param group - The group data in string format.
 * @returns The parsed UserStorageSyncedWalletGroup object.
 * @throws If the group data is not in valid JSON format or fails validation.
 */
export const parseGroupFromUserStorageResponse = (
  group: string,
): UserStorageSyncedWalletGroup => {
  try {
    const groupData = JSON.parse(group);
    assertValidUserStorageGroup(groupData);
    return groupData;
  } catch (error: unknown) {
    throw new Error(
      `Error trying to parse group from user storage response: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};
