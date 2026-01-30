import { toMultichainAccountWalletId } from '@metamask/account-api';
import { getUUIDFromAddressOfNormalAccount } from '@metamask/accounts-controller';

import { createMultichainAccountGroupsBatch } from './group';
import { backupAndSyncLogger } from '../../logger';
import { BackupAndSyncAnalyticsEvent } from '../analytics';
import type { ProfileId } from '../authentication';
import type { BackupAndSyncContext } from '../types';
import { getAllLegacyUserStorageAccounts } from '../user-storage';
import { getLocalGroupsForEntropyWallet } from '../utils';

/**
 * Performs a stripped down version of legacy account syncing, replacing the current
 * UserStorageController:syncInternalAccountsWithUserStorage call.
 * This ensures legacy (V1) account syncing data is correctly migrated to
 * the new AccountTreeController data structure. It should only happen
 * once per wallet.
 *
 * @param context - The sync context containing controller and messenger.
 * @param entropySourceId - The entropy source ID.
 * @param profileId - The profile ID for analytics.
 */
export const performLegacyAccountSyncing = async (
  context: BackupAndSyncContext,
  entropySourceId: string,
  profileId: ProfileId,
) => {
  // 1. Get legacy account syncing data
  const legacyAccountsFromUserStorage = await getAllLegacyUserStorageAccounts(
    context,
    entropySourceId,
  );
  if (legacyAccountsFromUserStorage.length === 0) {
    backupAndSyncLogger('No legacy accounts, skipping legacy account syncing');

    context.emitAnalyticsEventFn({
      action: BackupAndSyncAnalyticsEvent.LegacySyncingDone,
      profileId,
    });

    return;
  }

  // 2. Create account groups accordingly
  const numberOfAccountGroupsToCreate = legacyAccountsFromUserStorage.length;

  backupAndSyncLogger(
    `Creating ${numberOfAccountGroupsToCreate} account groups for legacy accounts`,
  );

  if (numberOfAccountGroupsToCreate > 0) {
    // Creating multichain account group is idempotent, so we can safely
    // re-create every groups starting from 0.
    // Use batch creation for better performance.
    await createMultichainAccountGroupsBatch(
      context,
      entropySourceId,
      numberOfAccountGroupsToCreate - 1, // maxGroupIndex is inclusive, so subtract 1
      profileId,
      BackupAndSyncAnalyticsEvent.LegacyGroupAddedFromAccount,
    );
  }

  // 3. Rename account groups if needed
  const localAccountGroups = getLocalGroupsForEntropyWallet(
    context,
    toMultichainAccountWalletId(entropySourceId),
  );
  for (const legacyAccount of legacyAccountsFromUserStorage) {
    // n: name
    // a: EVM address
    const { n, a } = legacyAccount;
    if (!a || !n) {
      backupAndSyncLogger(
        `Legacy account data is missing name or address, skipping account: ${JSON.stringify(
          legacyAccount,
        )}`,
      );
      continue;
    }

    if (n) {
      // Find the local group that corresponds to this EVM address
      const localAccountId = getUUIDFromAddressOfNormalAccount(a);
      const localGroup = localAccountGroups.find((group) =>
        group.accounts.includes(localAccountId),
      );
      if (localGroup) {
        context.controller.setAccountGroupName(localGroup.id, n, true);

        context.emitAnalyticsEventFn({
          action: BackupAndSyncAnalyticsEvent.LegacyGroupRenamed,
          profileId,
          additionalDescription: `Renamed legacy group ${localGroup.id} to ${n}`,
        });
      }
    }
  }

  context.emitAnalyticsEventFn({
    action: BackupAndSyncAnalyticsEvent.LegacySyncingDone,
    profileId,
  });
};
