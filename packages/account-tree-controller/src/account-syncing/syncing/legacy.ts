import type { InternalAccount } from '@metamask/keyring-internal-api';

import type { AccountTreeControllerState } from '../../types';
import type { AccountWalletEntropyObject } from '../../wallet';
import { MultichainAccountSyncingAnalyticsEvents } from '../analytics';
import { getProfileId } from '../authentication/utils';
import type { StateSnapshot } from '../controller-utils';
import {
  createStateSnapshot,
  getLocalEntropyWallets,
  getLocalGroupsForEntropyWallet,
} from '../controller-utils';
import type {
  AccountSyncingContext,
  LegacyAccountSyncingContext,
} from '../types';
import { getLegacyUserStorageData } from '../user-storage';

/**
 * Performs legacy account syncing if needed for any wallet.
 *
 * @param context - The account syncing context containing controller and messenger
 * @returns Promise that resolves to true if multichain syncing should continue, false otherwise.
 */
export async function performLegacyAccountSyncingIfNeeded(
  context: AccountSyncingContext,
): Promise<{
  shouldContinueWithMultichainSync: boolean;
  hasLegacySyncingBeenPerformed: boolean;
}> {
  const isMultichainAccountSyncingEnabled = context.messenger.call(
    'UserStorageController:getIsMultichainAccountSyncingEnabled',
  );

  const localSyncableWallets = getLocalEntropyWallets(context);

  const doSomeLocalSyncableWalletsNeedLegacySyncing = localSyncableWallets.some(
    (syncableWallet) =>
      !context.controller.state.walletsForWhichLegacyAccountSyncingIsDisabled[
        syncableWallet.metadata.entropy.id
      ],
  );

  if (!doSomeLocalSyncableWalletsNeedLegacySyncing) {
    // No legacy syncing needed, respect multichain syncing setting
    return {
      shouldContinueWithMultichainSync: isMultichainAccountSyncingEnabled,
      hasLegacySyncingBeenPerformed: false,
    };
  }

  // Dispatch legacy account syncing method before proceeding
  await context.messenger.call(
    'UserStorageController:syncInternalAccountsWithUserStorage',
  );

  const primarySrpProfileId = await getProfileId(context);
  context.emitAnalyticsEventFn({
    action: MultichainAccountSyncingAnalyticsEvents.LEGACY_SYNCING_DONE,
    profileId: primarySrpProfileId,
  });

  // Don't proceed with multichain syncing
  if (!isMultichainAccountSyncingEnabled) {
    return {
      shouldContinueWithMultichainSync: false,
      hasLegacySyncingBeenPerformed: true,
    };
  }

  // Disable legacy syncing after the first successful sync
  const updates: AccountTreeControllerState['walletsForWhichLegacyAccountSyncingIsDisabled'] =
    {};
  localSyncableWallets.forEach((syncableWallet) => {
    const syncableWalletEntropySourceId = syncableWallet.metadata.entropy.id;
    updates[syncableWalletEntropySourceId] = true;
  });

  context.controllerStateUpdateFn((state) => {
    Object.assign(state.walletsForWhichLegacyAccountSyncingIsDisabled, updates);
  });

  // Proceed with multichain syncing;
  return {
    shouldContinueWithMultichainSync: true,
    hasLegacySyncingBeenPerformed: true,
  };
}

/**
 * Resolves potential conflicts after legacy syncing by checking if local group names
 * have changed due to legacy syncing and updating them accordingly.
 *
 * @param context - The account syncing context.
 * @param legacyContext - The legacy account syncing context containing methods to list accounts and get entropy rules.
 * @param wallet - The wallet to resolve conflicts for.
 * @param stateSnapshot - The state snapshot before legacy syncing.
 * @param allInternalAccounts - List of all internal accounts to check against legacy synced accounts.
 */
const resolvePotentialConflictsAfterLegacySyncing = async (
  context: AccountSyncingContext,
  legacyContext: Omit<LegacyAccountSyncingContext, 'listAccounts'>,
  wallet: AccountWalletEntropyObject,
  stateSnapshot: StateSnapshot,
  allInternalAccounts: InternalAccount[],
) => {
  const entropySourceId = wallet.metadata.entropy.id;
  const localGroupsWithNamesThatHaveChangedDueToLegacySyncing =
    getLocalGroupsForEntropyWallet(context, wallet.id).filter(
      (group) =>
        stateSnapshot.accountGroupsMetadata[group.id]?.name?.value !==
        context.controller.state.accountGroupsMetadata[group.id]?.name?.value,
    );

  if (localGroupsWithNamesThatHaveChangedDueToLegacySyncing.length) {
    // If there are local groups with names that have changed due to legacy syncing,
    // we need to check if this renaming was legitimate by comparing the lastUpdatedAt timestamps.

    // First, fetch legacy accounts from user storage to compare with local groups
    // This is the only place where the timestamp is accurate
    const legacyAccountsFromUserStorage = await getLegacyUserStorageData(
      context,
      entropySourceId,
    );

    // Iterate through all accounts in the current wallet
    // and check if any of them correspond to legacy synced accounts.
    for (const account of allInternalAccounts) {
      const correspondingLegacyUserStorageAccount =
        legacyAccountsFromUserStorage.find(
          (legacyAccount) => legacyAccount.a === account.address,
        );

      if (!correspondingLegacyUserStorageAccount) {
        continue;
      }

      const correspondingEntropyAccount = legacyContext
        .getEntropyRule()
        .match(account);
      if (!correspondingEntropyAccount) {
        continue;
      }

      const correspondingLocalGroupThatChangedNameDueToLegacySyncing =
        localGroupsWithNamesThatHaveChangedDueToLegacySyncing.find(
          (group) => group.id === correspondingEntropyAccount.group.id,
        );

      if (!correspondingLocalGroupThatChangedNameDueToLegacySyncing) {
        continue;
      }

      const correspondingLocalGroupFromSnapshot =
        stateSnapshot.accountGroupsMetadata[
          correspondingLocalGroupThatChangedNameDueToLegacySyncing.id
        ];

      if (!correspondingLocalGroupFromSnapshot.name?.lastUpdatedAt) {
        continue; // No lastUpdatedAt timestamp available, cannot compare
      }

      const wasLocalGroupNameMoreRecent =
        correspondingLocalGroupFromSnapshot.name?.lastUpdatedAt >
        correspondingLegacyUserStorageAccount.nlu;

      if (wasLocalGroupNameMoreRecent) {
        // If the local group name was more recent, then we should rollback and use the previous local group name
        // instead of the one fetched from user storage.
        context.controller.setAccountGroupName(
          correspondingLocalGroupThatChangedNameDueToLegacySyncing.id,
          correspondingLocalGroupFromSnapshot.name?.value,
        );
      }
    }
  }
};

/**
 * Performs legacy account syncing if needed and resolves potential conflicts
 * after legacy syncing by checking if local group names have wrongfully changed due to legacy syncing.
 *
 * @param context - The account syncing context.
 * @param legacyContext - The legacy account syncing context containing methods to list accounts and get entropy rules.
 * @returns An object indicating whether multichain syncing should continue and if legacy syncing was performed.
 */
export const performLegacyAccountSyncingIfNeededAndResolvePotentialConflicts =
  async (
    context: AccountSyncingContext,
    legacyContext: LegacyAccountSyncingContext,
  ): Promise<{
    shouldContinueWithMultichainSync: boolean;
  }> => {
    // Prepare a snapshot for resolving potential legacy syncing name conflicts
    const stateSnapshot = createStateSnapshot(context);

    // Perform legacy syncing if needed
    // This method iterates over all local SRPs and syncs EVM HD accounts and their names
    const { shouldContinueWithMultichainSync, hasLegacySyncingBeenPerformed } =
      await performLegacyAccountSyncingIfNeeded(context);

    // If legacy syncing was performed, we need to check if any local groups have names that have changed
    // due to legacy syncing. This is important because there's a chance prior local group names should
    // still take precedence over the names that were fetched from user storage.
    // This is due to the fact that legacy syncing updates InternalAccount names and automatically sets
    // the timestamp to the current time, which might not be what we want.
    if (hasLegacySyncingBeenPerformed) {
      const allInternalAccounts = legacyContext.listAccounts();

      for (const wallet of getLocalEntropyWallets(context)) {
        try {
          await resolvePotentialConflictsAfterLegacySyncing(
            context,
            legacyContext,
            wallet,
            stateSnapshot,
            allInternalAccounts,
          );
        } catch (error) {
          if (context.enableDebugLogging) {
            console.error(
              `Error during legacy syncing conflict resolution for wallet ${wallet.id}:`,
              error instanceof Error ? error.message : String(error),
            );
          }
          // If legacy syncing fails, we still want to continue with the next wallet
          continue;
        }
      }
    }

    return {
      shouldContinueWithMultichainSync,
    };
  };
