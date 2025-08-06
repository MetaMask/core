import {
  emitAnalyticsEvent,
  MultichainAccountSyncingAnalyticsEvents,
} from './analytics';
import { getProfileId } from './authentication/utils';
import type { AccountSyncingContext } from './types';
import { getLocalEntropyWallets } from './wallet-utils';
import type { AccountTreeControllerState } from '../types';

/**
 * Performs legacy account syncing if needed for any wallet.
 *
 * @param context - The account syncing context containing controller and messenger
 * @returns Promise that resolves to true if multichain syncing should continue, false otherwise.
 */
export async function performLegacySyncingIfNeeded(
  context: AccountSyncingContext,
): Promise<boolean> {
  const localSyncableWallets = getLocalEntropyWallets(context);

  const doSomeLocalSyncableWalletsNeedLegacySyncing = localSyncableWallets.some(
    (syncableWallet) =>
      !context.controller.state.isLegacyAccountSyncingDisabled[
        syncableWallet.metadata.entropy.id
      ],
  );

  if (!doSomeLocalSyncableWalletsNeedLegacySyncing) {
    return true; // No legacy syncing needed, proceed with multichain syncing
  }

  // Dispatch legacy account syncing method before proceeding
  await context.messenger.call(
    'UserStorageController:syncInternalAccountsWithUserStorage',
  );

  const primarySrpProfileId = await getProfileId(context);
  await emitAnalyticsEvent({
    action: MultichainAccountSyncingAnalyticsEvents.LEGACY_SYNCING_DONE,
    profileId: primarySrpProfileId,
  });

  // Check if multichain account syncing is enabled after legacy sync
  const isMultichainAccountSyncingEnabled = context.messenger.call(
    'UserStorageController:getIsMultichainAccountSyncingEnabled',
  );

  if (!isMultichainAccountSyncingEnabled) {
    return false; // Don't proceed with multichain syncing
  }

  // Disable legacy syncing after the first successful sync
  const updates: AccountTreeControllerState['isLegacyAccountSyncingDisabled'] =
    {};
  localSyncableWallets.forEach((syncableWallet) => {
    const syncableWalletEntropySourceId = syncableWallet.metadata.entropy.id;
    updates[syncableWalletEntropySourceId] = true;
  });

  context.controllerStateUpdateFn((state) => {
    Object.assign(state.isLegacyAccountSyncingDisabled, updates);
  });

  return true; // Proceed with multichain syncing;
}
