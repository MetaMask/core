import type { AccountGroupMultichainAccountObject } from 'src/group';

import { compareAndSyncMetadata } from './metadata';
import type { AccountWalletEntropyObject } from '../../wallet';
import {
  emitAnalyticsEvent,
  MultichainAccountSyncingAnalyticsEvents,
} from '../analytics';
import { getLocalGroupsForEntropyWallet } from '../controller-utils';
import type {
  AccountSyncingContext,
  UserStorageSyncedWalletGroup,
} from '../types';
import { pushGroupToUserStorageBatch } from '../user-storage/network-operations';
import { isValidUserStorageGroup } from '../user-storage/validation';

/**
 * Creates local groups from user storage groups.
 *
 * @param context - The sync context containing controller and messenger.
 * @param groupsFromUserStorage - Array of groups from user storage.
 * @param entropySourceId - The entropy source ID.
 * @param profileId - The profile ID for analytics.
 */
export async function createLocalGroupsFromUserStorage(
  context: AccountSyncingContext,
  groupsFromUserStorage: UserStorageSyncedWalletGroup[],
  entropySourceId: string,
  profileId: string,
): Promise<void> {
  // Validate all groups before processing
  const validGroups = groupsFromUserStorage.filter((group) => {
    if (!isValidUserStorageGroup(group)) {
      console.warn(
        `Invalid group data from user storage for entropy ${entropySourceId}, skipping group`,
        group,
      );
      return false;
    }
    return true;
  });

  if (validGroups.length !== groupsFromUserStorage.length) {
    console.warn(
      `Filtered out ${
        groupsFromUserStorage.length - validGroups.length
      } invalid groups from user storage`,
    );
  }

  // Sort groups from user storage by groupIndex in ascending order
  validGroups.sort((a, b) => a.groupIndex - b.groupIndex);

  let previousGroupIndex = -1;
  for (const groupFromUserStorage of validGroups) {
    const { groupIndex } = groupFromUserStorage;

    if (typeof groupIndex !== 'number' || groupIndex < 0) {
      console.warn(
        `Invalid group index ${groupIndex} found in user storage, skipping`,
      );
      continue;
    }

    const isGroupIndexOutOfSequence =
      groupIndex <= previousGroupIndex || groupIndex !== previousGroupIndex + 1;
    previousGroupIndex = groupIndex;

    if (isGroupIndexOutOfSequence) {
      console.warn(
        `Group index ${groupIndex} is out of sequence, this may indicate data corruption`,
      );
    }

    try {
      // This will be idempotent so we can create the group even if it already exists
      await context.messenger.call(
        'MultichainAccountService:createMultichainAccountGroup',
        {
          entropySource: entropySourceId,
          groupIndex,
        },
      );

      await emitAnalyticsEvent({
        action: MultichainAccountSyncingAnalyticsEvents.GROUP_ADDED,
        profileId,
      });
    } catch (error) {
      console.error(
        `Failed to create group ${groupIndex} for entropy ${entropySourceId}:`,
        error instanceof Error ? error.message : String(error),
      );
      // Continue with other groups instead of failing completely
      continue;
    }
  }
}

/**
 * Syncs group metadata between local and user storage.
 *
 * @param context - The sync context containing controller and messenger.
 * @param wallet - The local wallet containing the groups.
 * @param groupsFromUserStorage - Array of groups from user storage.
 * @param entropySourceId - The entropy source ID.
 * @param profileId - The profile ID for analytics.
 */
export async function syncGroupsMetadata(
  context: AccountSyncingContext,
  wallet: AccountWalletEntropyObject,
  groupsFromUserStorage: UserStorageSyncedWalletGroup[],
  entropySourceId: string,
  profileId: string,
): Promise<void> {
  const localSyncableGroupsToBePushedToUserStorage: AccountGroupMultichainAccountObject[] =
    [];

  const localSyncableGroups = getLocalGroupsForEntropyWallet(
    context,
    wallet.id,
  );

  for (const localSyncableGroup of localSyncableGroups) {
    const groupFromUserStorage = groupsFromUserStorage.find(
      (group) =>
        group.groupIndex === localSyncableGroup.metadata.entropy.groupIndex,
    );

    if (!groupFromUserStorage) {
      // If the group does not exist in user storage, we need to push it
      localSyncableGroupsToBePushedToUserStorage.push(localSyncableGroup);
      continue;
    }

    // Compare metadata and update if needed
    const groupPersistedMetadata =
      context.controller.state.accountGroupsMetadata[localSyncableGroup.id];

    // Defensive check: ensure we have proper metadata structure
    if (!groupPersistedMetadata) {
      console.warn(
        `No persisted metadata found for group ${localSyncableGroup.id}, pushing to user storage`,
      );
      localSyncableGroupsToBePushedToUserStorage.push(localSyncableGroup);
      continue;
    }

    // Track if we need to push this group to user storage
    let shouldPushGroup = false;

    // Compare and sync name metadata
    const shouldPushForName = await compareAndSyncMetadata({
      localMetadata: groupPersistedMetadata.name,
      userStorageMetadata: groupFromUserStorage.name,
      applyLocalUpdate: (name: string) => {
        context.controller.setAccountGroupName(localSyncableGroup.id, name);
      },
      analytics: {
        event: MultichainAccountSyncingAnalyticsEvents.GROUP_RENAMED,
        profileId,
      },
    });

    shouldPushGroup = shouldPushGroup || shouldPushForName;

    // Compare and sync pinned metadata
    const shouldPushForPinned = await compareAndSyncMetadata({
      localMetadata: groupPersistedMetadata.pinned,
      userStorageMetadata: groupFromUserStorage.pinned,
      applyLocalUpdate: (pinned: boolean) => {
        context.controller.setAccountGroupPinned(localSyncableGroup.id, pinned);
      },
      analytics: {
        event:
          MultichainAccountSyncingAnalyticsEvents.GROUP_PINNED_STATUS_CHANGED,
        profileId,
      },
    });

    shouldPushGroup = shouldPushGroup || shouldPushForPinned;

    // Compare and sync hidden metadata
    const shouldPushForHidden = await compareAndSyncMetadata({
      localMetadata: groupPersistedMetadata.hidden,
      userStorageMetadata: groupFromUserStorage.hidden,
      applyLocalUpdate: (hidden: boolean) => {
        context.controller.setAccountGroupHidden(localSyncableGroup.id, hidden);
      },
      analytics: {
        event:
          MultichainAccountSyncingAnalyticsEvents.GROUP_HIDDEN_STATUS_CHANGED,
        profileId,
      },
    });

    shouldPushGroup = shouldPushGroup || shouldPushForHidden;

    // Add to push list if any metadata needs to be updated in user storage
    if (shouldPushGroup) {
      localSyncableGroupsToBePushedToUserStorage.push(localSyncableGroup);
    }
  }

  // Push all groups that need to be updated to user storage
  if (localSyncableGroupsToBePushedToUserStorage.length > 0) {
    await pushGroupToUserStorageBatch(
      context,
      localSyncableGroupsToBePushedToUserStorage,
      entropySourceId,
    );
  }
}
