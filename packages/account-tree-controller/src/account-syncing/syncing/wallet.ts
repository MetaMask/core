import { compareAndSyncMetadata } from './metadata';
import type { AccountWalletEntropyObject } from '../../wallet';
import { MultichainAccountSyncingAnalyticsEvents } from '../analytics';
import type { AccountSyncingContext, UserStorageSyncedWallet } from '../types';
import { pushWalletToUserStorage } from '../user-storage/network-operations';
import { isValidUserStorageWallet } from '../user-storage/validation';

/**
 * Syncs wallet metadata with user storage.
 *
 * @param context - The sync context containing controller and messenger.
 * @param wallet - The local wallet to sync.
 * @param walletFromUserStorage - The wallet data from user storage, if any.
 * @param profileId - The profile ID for analytics.
 */
export async function syncWalletMetadata(
  context: AccountSyncingContext,
  wallet: AccountWalletEntropyObject,
  walletFromUserStorage: UserStorageSyncedWallet | null,
  profileId: string,
): Promise<void> {
  // If wallet data does not exist in user storage, push the local wallet
  if (!walletFromUserStorage) {
    await pushWalletToUserStorage(context, wallet);
    return;
  }

  // Validate user storage data before processing
  if (!isValidUserStorageWallet(walletFromUserStorage)) {
    console.warn(
      `Invalid wallet data from user storage for wallet ${wallet.id}, pushing local data`,
    );
    await pushWalletToUserStorage(context, wallet);
    return;
  }

  const persistedMetadata =
    context.controller.state.accountWalletsMetadata[wallet.id];

  if (!persistedMetadata) {
    console.warn(
      `No persisted metadata found for wallet ${wallet.id}, skipping sync`,
    );
    return;
  }

  // Compare and sync name metadata
  const shouldPushToUserStorage = await compareAndSyncMetadata({
    localMetadata: persistedMetadata?.name,
    userStorageMetadata: walletFromUserStorage.name,
    applyLocalUpdate: (name: string) => {
      context.controller.setAccountWalletName(wallet.id, name);
    },
    analytics: {
      event: MultichainAccountSyncingAnalyticsEvents.WALLET_RENAMED,
      profileId,
    },
  });

  if (shouldPushToUserStorage) {
    // Local name is more recent, push it to user storage
    await pushWalletToUserStorage(context, wallet);
  }
}
