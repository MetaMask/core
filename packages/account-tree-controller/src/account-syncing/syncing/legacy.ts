import type { InternalAccount } from '@metamask/keyring-internal-api';

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
import {
  getLegacyUserStorageData,
  pushWalletToUserStorage,
} from '../user-storage';

/**
 * Performs legacy account syncing.
 *
 * @param context - The account syncing context containing controller and messenger
 * @returns Promise that resolves to true if multichain syncing should continue, false otherwise.
 */
export async function performLegacyAccountSyncing(
  context: AccountSyncingContext,
): Promise<void> {
  await context.messenger.call(
    'UserStorageController:syncInternalAccountsWithUserStorage',
  );

  const primarySrpProfileId = await getProfileId(context);
  context.emitAnalyticsEventFn({
    action: MultichainAccountSyncingAnalyticsEvents.LEGACY_SYNCING_DONE,
    profileId: primarySrpProfileId,
  });

  // Disable legacy syncing after the first successful sync by pushing all local wallets
  // to the user storage with the `isLegacyAccountSyncingDisabled` flag set to true.
  const allLocalEntropyWallets = getLocalEntropyWallets(context);
  await Promise.all(
    allLocalEntropyWallets.map(async (wallet) => {
      await pushWalletToUserStorage(context, wallet, {
        isLegacyAccountSyncingDisabled: true,
      });
    }),
  );
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

    // Iterate through groups that have changed names due to legacy syncing
    // and check if the name change should be reverted based on timestamps.
    for (const localGroupThatChangedNameDueToLegacySyncing of localGroupsWithNamesThatHaveChangedDueToLegacySyncing) {
      const correspondingLocalGroupFromSnapshot =
        stateSnapshot.accountGroupsMetadata[
          localGroupThatChangedNameDueToLegacySyncing.id
        ];

      const originalGroupName = correspondingLocalGroupFromSnapshot.name;
      if (!originalGroupName || !originalGroupName.lastUpdatedAt) {
        continue;
      }

      // Find the account that belongs to this group (there's only one HD EVM account per group)
      // We do this to find the address of the account that corresponds to this group
      // and then find the corresponding legacy user storage entry.
      const accountInGroup = allInternalAccounts.find((account) => {
        const correspondingEntropyAccount = legacyContext
          .getEntropyRule()
          .match(account);
        return (
          correspondingEntropyAccount?.group.id ===
          localGroupThatChangedNameDueToLegacySyncing.id
        );
      });

      // Shouldn't happen, type guard
      if (!accountInGroup) {
        continue;
      }

      // Check if this account has a corresponding legacy user storage entry
      // Again, this is a type guard as we wouldn't end up here if there was no legacy user storage data
      const correspondingLegacyUserStorageAccount =
        legacyAccountsFromUserStorage.find(
          (legacyAccount) => legacyAccount.a === accountInGroup.address,
        );

      if (!correspondingLegacyUserStorageAccount) {
        continue; // No legacy user storage data for this account
      }

      const wasLocalGroupNameMoreRecent =
        originalGroupName.lastUpdatedAt >
        correspondingLegacyUserStorageAccount.nlu;

      if (wasLocalGroupNameMoreRecent) {
        // If the local group name was more recent, then we should rollback and use the previous local group name
        // instead of the one fetched from user storage.
        // We don't use setAccountGroupName here because we want to keep the original timestamp
        context.controllerStateUpdateFn((state) => {
          state.accountGroupsMetadata[
            localGroupThatChangedNameDueToLegacySyncing.id
          ].name = {
            value: originalGroupName.value,
            lastUpdatedAt: originalGroupName.lastUpdatedAt,
          };
          state.accountTree.wallets[wallet.id].groups[
            localGroupThatChangedNameDueToLegacySyncing.id
          ].metadata.name = originalGroupName.value;
        });
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
export const performLegacyAccountSyncingAndResolvePotentialConflicts = async (
  context: AccountSyncingContext,
  legacyContext: LegacyAccountSyncingContext,
): Promise<void> => {
  // Prepare a snapshot for resolving potential legacy syncing name conflicts
  const stateSnapshot = createStateSnapshot(context);

  // Perform legacy syncing if needed
  // This method iterates over all local SRPs and syncs EVM HD accounts and their names
  await performLegacyAccountSyncing(context);

  // We need to check if any local groups have names that have changed
  // due to legacy syncing. This is important because there's a chance prior local group names should
  // still take precedence over the names that were fetched from user storage.
  // This is due to the fact that legacy syncing updates InternalAccount names and automatically sets
  // the timestamp to the current time, which might not be what we want.
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
};
