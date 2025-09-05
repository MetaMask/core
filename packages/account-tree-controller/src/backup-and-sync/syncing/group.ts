import { compareAndSyncMetadata } from './metadata';
import type { AccountGroupMultichainAccountObject } from '../../group';
import type { AccountWalletEntropyObject } from '../../wallet';
import type { BackupAndSyncAnalyticsEvent } from '../analytics';
import { BackupAndSyncAnalyticsEvents } from '../analytics';
import {
  UserStorageSyncedWalletGroupSchema,
  type BackupAndSyncContext,
  type UserStorageSyncedWalletGroup,
} from '../types';
import {
  pushGroupToUserStorage,
  pushGroupToUserStorageBatch,
} from '../user-storage/network-operations';
import { contextualLogger, getLocalGroupsForEntropyWallet } from '../utils';

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
  profileId: string,
  analyticsAction: BackupAndSyncAnalyticsEvent,
) => {
  try {
    // This will be idempotent so we can create the group even if it already exists
    await context.messenger.call(
      'MultichainAccountService:createMultichainAccountGroup',
      {
        entropySource: entropySourceId,
        groupIndex,
      },
    );

    context.emitAnalyticsEventFn({
      action: analyticsAction,
      profileId,
    });
  } catch (error) {
    if (context.enableDebugLogging) {
      contextualLogger.error(
        `Failed to create group ${groupIndex} for entropy ${entropySourceId}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
    throw error;
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
  profileId: string,
): Promise<void> {
  // Sort groups from user storage by groupIndex in ascending order
  groupsFromUserStorage.sort((a, b) => a.groupIndex - b.groupIndex);

  let previousGroupIndex = -1;
  for (const groupFromUserStorage of groupsFromUserStorage) {
    const { groupIndex } = groupFromUserStorage;

    if (typeof groupIndex !== 'number' || groupIndex < 0) {
      if (context.enableDebugLogging) {
        contextualLogger.warn(
          `Invalid group index ${groupIndex} found in user storage, skipping`,
        );
      }
      continue;
    }

    const isGroupIndexOutOfSequence =
      groupIndex <= previousGroupIndex || groupIndex !== previousGroupIndex + 1;
    previousGroupIndex = groupIndex;

    if (isGroupIndexOutOfSequence) {
      if (context.enableDebugLogging) {
        contextualLogger.warn(
          `Group index ${groupIndex} is out of sequence, this may indicate data corruption`,
        );
      }
    }

    const didGroupAlreadyExist = Object.values(
      context.controller.state.accountTree.wallets[`entropy:${entropySourceId}`]
        .groups,
    ).some((group) => group.metadata.entropy.groupIndex === groupIndex);

    if (didGroupAlreadyExist) {
      if (context.enableDebugLogging) {
        contextualLogger.warn(
          `Group with index ${groupIndex} (wallet entropy ${entropySourceId}) already exists, skipping creation`,
        );
      }
      continue; // Skip creating group if it already exists
    }

    try {
      await createMultichainAccountGroup(
        context,
        entropySourceId,
        groupIndex,
        profileId,
        BackupAndSyncAnalyticsEvents.GROUP_ADDED,
      );
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_) {
      // This can happen if the Snap Keyring is not ready yet when invoking
      // `MultichainAccountService:createMultichainAccountGroup`.
      // Since `MultichainAccountService:createMultichainAccountGroup` will at
      // least create the EVM account and the account group before throwing, we can safely
      // ignore this error and continue.
      // Any missing Snap accounts will be added later with alignment.
      continue;
    }
  }
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
  profileId: string,
): Promise<boolean> {
  const groupPersistedMetadata =
    context.controller.state.accountGroupsMetadata[localGroup.id];

  if (!groupFromUserStorage) {
    if (context.enableDebugLogging) {
      contextualLogger.warn(
        `Group ${localGroup.id} did not exist in user storage, pushing to user storage...`,
      );
    }

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
      context.controller.setAccountGroupName(localGroup.id, name);
    },
    analytics: {
      event: BackupAndSyncAnalyticsEvents.GROUP_RENAMED,
      profileId,
    },
  });

  shouldPushGroup = shouldPushGroup || shouldPushForName;

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
      event: BackupAndSyncAnalyticsEvents.GROUP_PINNED_STATUS_CHANGED,
      profileId,
    },
  });

  shouldPushGroup = shouldPushGroup || shouldPushForPinned;

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
      event: BackupAndSyncAnalyticsEvents.GROUP_HIDDEN_STATUS_CHANGED,
      profileId,
    },
  });

  shouldPushGroup = shouldPushGroup || shouldPushForHidden;

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
export async function syncSingleGroupMetadata(
  context: BackupAndSyncContext,
  localGroup: AccountGroupMultichainAccountObject,
  groupFromUserStorage: UserStorageSyncedWalletGroup | null,
  entropySourceId: string,
  profileId: string,
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
