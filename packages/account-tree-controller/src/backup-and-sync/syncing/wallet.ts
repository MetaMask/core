import { compareAndSyncMetadata } from './metadata';
import { backupAndSyncLogger } from '../../logger';
import type { AccountWalletEntropyObject } from '../../wallet';
import { BackupAndSyncAnalyticsEvent } from '../analytics';
import type { ProfileId } from '../authentication';
import { UserStorageSyncedWalletSchema } from '../types';
import type { BackupAndSyncContext, UserStorageSyncedWallet } from '../types';
import { pushWalletToUserStorage } from '../user-storage/network-operations';

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
  profileId: ProfileId,
): Promise<boolean> {
  const walletPersistedMetadata =
    context.controller.state.accountWalletsMetadata[localWallet.id];

  if (
    !walletFromUserStorage ||
    Object.keys(walletFromUserStorage).length === 0
  ) {
    backupAndSyncLogger(
      `Wallet ${localWallet.id} did not exist in user storage, pushing to user storage...`,
    );
    return true;
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
      action: BackupAndSyncAnalyticsEvent.WalletRenamed,
      profileId,
    },
  });

  shouldPushWallet ||= shouldPushForName;

  // Avoid re-triggering legacy-syncing (in case this field is missing on the remote
  // wallet object).
  const shouldPushForMissingLegacyField = !Object.prototype.hasOwnProperty.call(
    walletFromUserStorage,
    'isLegacyAccountSyncingDisabled',
  );

  shouldPushWallet ||= shouldPushForMissingLegacyField;

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
  profileId: ProfileId,
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
