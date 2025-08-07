import { MultichainAccountSyncingAnalyticsEvents } from '../analytics';
import { getProfileId } from '../authentication/utils';
import { getLocalEntropyWallets } from '../controller-utils';
import type { AccountSyncingContext } from '../types';
import { pushWalletToUserStorage } from '../user-storage';

/**
 * Performs legacy account syncing.
 *
 * @param context - The account syncing context containing controller and messenger
 * @returns Promise that resolves to true if multichain syncing should continue, false otherwise.
 */
export const performLegacyAccountSyncing = async (
  context: AccountSyncingContext,
): Promise<void> => {
  await context.messenger.call(
    'UserStorageController:syncInternalAccountsWithUserStorage',
  );

  const primarySrpProfileId = await getProfileId(context);
  context.emitAnalyticsEventFn({
    action: MultichainAccountSyncingAnalyticsEvents.LEGACY_SYNCING_DONE,
    profileId: primarySrpProfileId,
  });
};

/**
 * Disables legacy account syncing for all local wallets by pushing them to user storage
 * with the `isLegacyAccountSyncingDisabled` flag set to true.
 *
 * @param context - The account syncing context containing controller and messenger.
 * @returns Promise that resolves when all wallets have been updated.
 */
export const disableLegacyAccountSyncingForAllWallets = async (
  context: AccountSyncingContext,
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
