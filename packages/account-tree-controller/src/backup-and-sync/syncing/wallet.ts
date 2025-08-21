import { compareAndSyncMetadata } from './metadata';
import type { AccountWalletEntropyObject } from '../../wallet';
import { BackupAndSyncAnalyticsEvents } from '../analytics';
import {
  UserStorageSyncedWalletSchema,
  type BackupAndSyncContext,
  type UserStorageSyncedWallet,
} from '../types';
import { pushWalletToUserStorage } from '../user-storage/network-operations';
import { contextualLogger } from '../utils';

/**
 * Syncs wallet metadata fields and determines if the wallet needs to be pushed to user storage.
 *
 * @param context - The sync context containing controller and messenger.
 * @param localWallet - The local wallet to sync.
 * @param walletFromUserStorage - The wallet data from user storage, if any.
 * @param profileId - The profile ID for analytics.
 * @returns Promise resolving to true if the wallet should be pushed to user storage.
 */
export async function syncWalletMetadataAndCheckIfPushNeeded(
  context: BackupAndSyncContext,
  localWallet: AccountWalletEntropyObject,
  walletFromUserStorage: UserStorageSyncedWallet | null | undefined,
  profileId: string,
): Promise<boolean> {
  const walletPersistedMetadata =
    context.controller.state.accountWalletsMetadata[localWallet.id];

  if (!walletFromUserStorage) {
    if (walletPersistedMetadata) {
      if (context.enableDebugLogging) {
        contextualLogger.warn(
          `Wallet ${localWallet.id} does not exist in user storage, but has local metadata. Uploading it.`,
        );
      }
      return true; // If wallet does not exist in user storage, we need to push it
    }
    if (context.enableDebugLogging) {
      contextualLogger.warn(
        `Wallet ${localWallet.id} does not exist in user storage and has no local metadata, skipping sync`,
      );
    }
    return false; // No metadata to sync, nothing to push
  }
  // Track if we need to push this wallet to user storage
  let shouldPushWallet = false;

  // Compare and sync name metadata
  const shouldPushForName = await compareAndSyncMetadata({
    context,
    localMetadata: walletPersistedMetadata?.name,
    userStorageMetadata: walletFromUserStorage.name,
    validateUserStorageValue: (value) =>
      UserStorageSyncedWalletSchema.schema.name.schema.value.is(value),
    applyLocalUpdate: (name: string) => {
      context.controller.setAccountWalletName(localWallet.id, name);
    },
    analytics: {
      event: BackupAndSyncAnalyticsEvents.WALLET_RENAMED,
      profileId,
    },
  });

  shouldPushWallet ||= shouldPushForName;

  return shouldPushWallet;
}

/**
 * Syncs wallet metadata and pushes it to user storage if needed.
 *
 * @param context - The sync context containing controller and messenger.
 * @param localWallet - The local wallet to sync.
 * @param walletFromUserStorage - The wallet data from user storage, if any.
 * @param profileId - The profile ID for analytics.
 */
export async function syncWalletMetadata(
  context: BackupAndSyncContext,
  localWallet: AccountWalletEntropyObject,
  walletFromUserStorage: UserStorageSyncedWallet | null | undefined,
  profileId: string,
): Promise<void> {
  const shouldPushToUserStorage = await syncWalletMetadataAndCheckIfPushNeeded(
    context,
    localWallet,
    walletFromUserStorage,
    profileId,
  );

  if (shouldPushToUserStorage) {
    await pushWalletToUserStorage(context, localWallet);
  }
}
