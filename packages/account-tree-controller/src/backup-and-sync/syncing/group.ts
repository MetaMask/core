import { compareAndSyncMetadata } from './metadata';
import type { AccountGroupMultichainAccountObject } from '../../group';
import { backupAndSyncLogger } from '../../logger';
import type { AccountWalletEntropyObject } from '../../wallet';
import type { BackupAndSyncAnalyticsAction } from '../analytics';
import { BackupAndSyncAnalyticsEvent } from '../analytics';
import type { ProfileId } from '../authentication';
import { UserStorageSyncedWalletGroupSchema } from '../types';
import type {
  BackupAndSyncContext,
  UserStorageSyncedWalletGroup,
} from '../types';
import {
  pushGroupToUserStorage,
  pushGroupToUserStorageBatch,
} from '../user-storage/network-operations';
import {
  getLocalGroupForEntropyWallet,
  getLocalGroupsForEntropyWallet,
} from '../utils';

/**
 * Creates a multichain account group.
 *
 * @param context - The sync context containing controller and messenger.
 * @param entropySourceId - The entropy source ID.
 * @param groupIndex - The group index.
 * @param profileId - The profile ID for analytics.
 * @param analyticsAction - The analytics action to log.
 */
export const createMultichainAccountGroup = async (
  context: BackupAndSyncContext,
  entropySourceId: string,
  groupIndex: number,
  profileId: ProfileId,
  analyticsAction: BackupAndSyncAnalyticsAction,
) => {
  try {
    const didGroupAlreadyExist = getLocalGroupForEntropyWallet(
      context,
      entropySourceId,
      groupIndex,
    );

    // This will be idempotent so we can create the group even if it already exists
    await context.messenger.call(
      'MultichainAccountService:createMultichainAccountGroup',
      {
        entropySource: entropySourceId,
        groupIndex,
      },
    );

    if (!didGroupAlreadyExist) {
      context.emitAnalyticsEventFn({
        action: analyticsAction,
        profileId,
      });
    }
  } catch (error) {
    // This can happen if the Snap Keyring is not ready yet when invoking
    // `MultichainAccountService:createMultichainAccountGroup`.
    // Since `MultichainAccountService:createMultichainAccountGroup` will at
    // least create the EVM account and the account group before throwing, we can safely
    // ignore this error and swallow it.
    // Any missing Snap accounts will be added later with alignment.

    backupAndSyncLogger(
      `Failed to create group ${groupIndex} for entropy ${entropySourceId}:`,
      // istanbul ignore next
      error instanceof Error ? error.message : String(error),
    );
  }
};

/**
 * Creates multiple multichain account groups in batch (from 0 to maxGroupIndex).
 * This is an optimized version that creates all groups in one operation instead of
 * creating them sequentially.
 *
 * @param context - The sync context containing controller and messenger.
 * @param entropySourceId - The entropy source ID.
 * @param maxGroupIndex - Maximum group index (inclusive) to create.
 * @param profileId - The profile ID for analytics.
 * @param analyticsAction - The analytics action to log for each created group.
 * @returns Array of created group IDs.
 */
export const createMultichainAccountGroupsBatch = async (
  context: BackupAndSyncContext,
  entropySourceId: string,
  maxGroupIndex: number,
  profileId: ProfileId,
  analyticsAction: BackupAndSyncAnalyticsAction,
): Promise<string[]> => {
  backupAndSyncLogger(
    `Creating account groups 0-${maxGroupIndex} in batch for entropy source: ${entropySourceId}`,
  );

  try {
    // Call the batched creation method.
    const groups = await context.messenger.call(
      'MultichainAccountService:createMultichainAccountGroups',
      {
        entropySource: entropySourceId,
        maxGroupIndex,
      },
    );

    // Emit analytics event for each newly created group.
    // Note: groups array contains all groups (existing + newly created).
    const createdGroupIds: string[] = [];

    for (const group of groups) {
      // TODO: A group should not be null here, but EVM provider might fail to create some groups sometimes, which means
      // we can end up having an "empty group" for some time.
      if (group) {
        createdGroupIds.push(group.id);

        // Emit analytics event.
        context.emitAnalyticsEventFn({
          action: analyticsAction,
          profileId,
        });
      }
    }

    backupAndSyncLogger(
      `Successfully created ${groups.length} groups (indices 0-${maxGroupIndex})`,
    );

    return createdGroupIds;
  } catch (error) {
    // This can happen if the Snap Keyring is not ready yet when invoking
    // `MultichainAccountService:createMultichainAccountGroups`.
    // Since `MultichainAccountService:createMultichainAccountGroups` will at
    // least create the EVM account and the account group before throwing, we can safely
    // ignore this error and swallow it.
    // Any missing Snap accounts will be added later with alignment.

    backupAndSyncLogger(
      `Failed to create account groups batch:`,
      // istanbul ignore next
      error instanceof Error ? error.message : String(error),
    );

    return [];
  }
};

/**
 * Creates local groups from user storage groups.
 *
 * @param context - The sync context containing controller and messenger.
 * @param groupsFromUserStorage - Array of groups from user storage.
 * @param entropySourceId - The entropy source ID.
 * @param profileId - The profile ID for analytics.
 */
export async function createLocalGroupsFromUserStorage(
  context: BackupAndSyncContext,
  groupsFromUserStorage: UserStorageSyncedWalletGroup[],
  entropySourceId: string,
  profileId: ProfileId,
): Promise<void> {
  const numberOfAccountGroupsToCreate = Math.max(
    ...groupsFromUserStorage.map((g) => g.groupIndex),
  );

  // Creating multichain account group is idempotent, so we can safely
  // re-create every groups starting from 0.
  // Use batch creation for better performance.
  await createMultichainAccountGroupsBatch(
    context,
    entropySourceId,
    numberOfAccountGroupsToCreate,
    profileId,
    BackupAndSyncAnalyticsEvent.GroupAdded,
  );
}

/**
 * Syncs group metadata fields and determines if the group needs to be pushed to user storage.
 *
 * @param context - The sync context containing controller and messenger.
 * @param localGroup - The local group to sync.
 * @param groupFromUserStorage - The group from user storage to compare against.
 * @param profileId - The profile ID for analytics.
 * @returns A promise that resolves to true if the group needs to be pushed to user storage.
 */
async function syncGroupMetadataAndCheckIfPushNeeded(
  context: BackupAndSyncContext,
  localGroup: AccountGroupMultichainAccountObject,
  groupFromUserStorage: UserStorageSyncedWalletGroup | null | undefined,
  profileId: ProfileId,
): Promise<boolean> {
  const groupPersistedMetadata =
    context.controller.state.accountGroupsMetadata[localGroup.id];

  if (!groupFromUserStorage) {
    backupAndSyncLogger(
      `Group ${localGroup.id} did not exist in user storage, pushing to user storage...`,
    );

    return true;
  }

  // Track if we need to push this group to user storage
  let shouldPushGroup = false;

  // Compare and sync name metadata
  const shouldPushForName = await compareAndSyncMetadata({
    context,
    localMetadata: groupPersistedMetadata?.name,
    userStorageMetadata: groupFromUserStorage.name,
    validateUserStorageValue: (value) =>
      UserStorageSyncedWalletGroupSchema.schema.name.schema.value.is(value),
    applyLocalUpdate: (name: string) => {
      context.controller.setAccountGroupName(localGroup.id, name, true);
    },
    analytics: {
      action: BackupAndSyncAnalyticsEvent.GroupRenamed,
      profileId,
    },
  });

  shouldPushGroup ||= shouldPushForName;

  // Compare and sync pinned metadata
  const shouldPushForPinned = await compareAndSyncMetadata({
    context,
    localMetadata: groupPersistedMetadata?.pinned,
    userStorageMetadata: groupFromUserStorage.pinned,
    validateUserStorageValue: (value) =>
      UserStorageSyncedWalletGroupSchema.schema.pinned.schema.value.is(value),
    applyLocalUpdate: (pinned: boolean) => {
      context.controller.setAccountGroupPinned(localGroup.id, pinned);
    },
    analytics: {
      action: BackupAndSyncAnalyticsEvent.GroupPinnedStatusChanged,
      profileId,
    },
  });

  shouldPushGroup ||= shouldPushForPinned;

  // Compare and sync hidden metadata
  const shouldPushForHidden = await compareAndSyncMetadata({
    context,
    localMetadata: groupPersistedMetadata?.hidden,
    userStorageMetadata: groupFromUserStorage.hidden,
    validateUserStorageValue: (value) =>
      UserStorageSyncedWalletGroupSchema.schema.hidden.schema.value.is(value),
    applyLocalUpdate: (hidden: boolean) => {
      context.controller.setAccountGroupHidden(localGroup.id, hidden);
    },
    analytics: {
      action: BackupAndSyncAnalyticsEvent.GroupHiddenStatusChanged,
      profileId,
    },
  });

  shouldPushGroup ||= shouldPushForHidden;

  return shouldPushGroup;
}

/**
 * Syncs a single group's metadata between local and user storage.
 *
 * @param context - The sync context containing controller and messenger.
 * @param localGroup - The local group to sync.
 * @param groupFromUserStorage - The group from user storage to compare against (or null if it doesn't exist).
 * @param entropySourceId - The entropy source ID.
 * @param profileId - The profile ID for analytics.
 */
export async function syncGroupMetadata(
  context: BackupAndSyncContext,
  localGroup: AccountGroupMultichainAccountObject,
  groupFromUserStorage: UserStorageSyncedWalletGroup | null,
  entropySourceId: string,
  profileId: ProfileId,
): Promise<void> {
  const shouldPushGroup = await syncGroupMetadataAndCheckIfPushNeeded(
    context,
    localGroup,
    groupFromUserStorage,
    profileId,
  );

  if (shouldPushGroup) {
    await pushGroupToUserStorage(context, localGroup, entropySourceId);
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
  context: BackupAndSyncContext,
  wallet: AccountWalletEntropyObject,
  groupsFromUserStorage: UserStorageSyncedWalletGroup[],
  entropySourceId: string,
  profileId: ProfileId,
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

    const shouldPushGroup = await syncGroupMetadataAndCheckIfPushNeeded(
      context,
      localSyncableGroup,
      groupFromUserStorage,
      profileId,
    );

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
