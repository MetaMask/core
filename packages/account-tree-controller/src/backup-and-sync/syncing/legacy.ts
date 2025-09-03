import { getUUIDFromAddressOfNormalAccount } from '@metamask/accounts-controller';

import { createMultichainAccountGroup } from './group';
import { BackupAndSyncAnalyticsEvents } from '../analytics';
import type { BackupAndSyncContext } from '../types';
import { getAllLegacyUserStorageAccounts } from '../user-storage';
import { contextualLogger, getLocalGroupsForEntropyWallet } from '../utils';

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
  profileId: string,
) => {
  // 1. Get legacy account syncing data
  const legacyAccountsFromUserStorage = await getAllLegacyUserStorageAccounts(
    context,
    entropySourceId,
  );
  if (legacyAccountsFromUserStorage.length === 0) {
    if (context.enableDebugLogging) {
      contextualLogger.info(
        'No legacy accounts, skipping legacy account syncing',
      );
    }

    context.emitAnalyticsEventFn({
      action: BackupAndSyncAnalyticsEvents.LEGACY_SYNCING_DONE,
      profileId,
    });

    return;
  }

  // 2. Create account groups accordingly
  const numberOfAccountGroupsToCreate = legacyAccountsFromUserStorage.length;

  if (context.enableDebugLogging) {
    contextualLogger.info(
      `Creating ${numberOfAccountGroupsToCreate} account groups for legacy accounts`,
    );
  }

  if (numberOfAccountGroupsToCreate > 0) {
    for (let i = 0; i < numberOfAccountGroupsToCreate; i++) {
      if (context.enableDebugLogging) {
        contextualLogger.info(`Creating account group ${i} for legacy account`);
      }
      await createMultichainAccountGroup(
        context,
        entropySourceId,
        i,
        profileId,
        BackupAndSyncAnalyticsEvents.LEGACY_GROUP_ADDED_FROM_ACCOUNT,
      );
    }
  }

  // 3. Rename account groups if needed
  const localAccountGroups = getLocalGroupsForEntropyWallet(
    context,
    `entropy:${entropySourceId}`,
  );
  for (const legacyAccount of legacyAccountsFromUserStorage) {
    // n: name
    // a: EVM address
    const { n, a } = legacyAccount;
    if (!a || !n) {
      if (context.enableDebugLogging) {
        contextualLogger.warn(
          `Legacy account data is missing name or address, skipping account: ${JSON.stringify(
            legacyAccount,
          )}`,
        );
      }
      continue;
    }
    const localGroupId = getUUIDFromAddressOfNormalAccount(a);

    if (n) {
      // Find the local group that corresponds to this EVM address
      const localGroup = localAccountGroups.find((group) =>
        group.accounts.some((accountId) => accountId === localGroupId),
      );
      if (localGroup) {
        context.controller.setAccountGroupName(localGroup.id, n);

        context.emitAnalyticsEventFn({
          action: BackupAndSyncAnalyticsEvents.LEGACY_GROUP_RENAMED,
          profileId,
          additionalDescription: `Renamed legacy group ${localGroup.id} to ${n}`,
        });
      }
    }
  }

  context.emitAnalyticsEventFn({
    action: BackupAndSyncAnalyticsEvents.LEGACY_SYNCING_DONE,
    profileId,
  });
};
