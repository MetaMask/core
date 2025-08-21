import { BackupAndSyncAnalyticsEvents } from '../analytics';
import { getProfileId } from '../authentication/utils';
import { getLocalEntropyWallets } from '../utils';
import type { BackupAndSyncContext } from '../types';
import { pushWalletToUserStorage } from '../user-storage';

/**
 * Performs legacy account syncing.
 *
 * @param context - The backup and sync context containing controller and messenger
 * @returns Promise that resolves to true if multichain syncing should continue, false otherwise.
 */
export const performLegacyAccountSyncing = async (
  context: BackupAndSyncContext,
): Promise<void> => {
  await context.messenger.call(
    'UserStorageController:syncInternalAccountsWithUserStorage',
  );

  const primarySrpProfileId = await getProfileId(context);
  context.emitAnalyticsEventFn({
    action: BackupAndSyncAnalyticsEvents.LEGACY_SYNCING_DONE,
    profileId: primarySrpProfileId,
  });
};

/**
 * Disables legacy account syncing for all local wallets by pushing them to user storage
 * with the `isLegacyAccountSyncingDisabled` flag set to true.
 *
 * @param context - The backup and sync context containing controller and messenger.
 * @returns Promise that resolves when all wallets have been updated.
 */
export const disableLegacyAccountSyncingForAllWallets = async (
  context: BackupAndSyncContext,
): Promise<void> => {
  const allLocalEntropyWallets = getLocalEntropyWallets(context);
  await Promise.all(
    allLocalEntropyWallets.map(async (wallet) => {
      await pushWalletToUserStorage(context, wallet, {
        isLegacyAccountSyncingDisabled: true,
      });
    }),
  );
};
