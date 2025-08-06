import type { MultichainAccountSyncingAnalyticsEvent } from '../analytics';
import type { AccountSyncingContext } from '../types';

/**
 * Compares metadata between local and user storage, applying the most recent version.
 * Automatically validates user storage data based on the local metadata type.
 *
 * @param options - Configuration object for metadata comparison.
 * @param options.context - The account syncing context containing controller and messenger.
 * @param options.localMetadata - The local metadata object.
 * @param options.localMetadata.value - The local metadata value.
 * @param options.localMetadata.lastUpdatedAt - The local metadata timestamp.
 * @param options.userStorageMetadata - The user storage metadata object.
 * @param options.userStorageMetadata.value - The user storage metadata value.
 * @param options.userStorageMetadata.lastUpdatedAt - The user storage metadata timestamp.
 * @param options.applyLocalUpdate - Function to apply the user storage value locally.
 * @param options.analytics - Optional analytics configuration for tracking updates.
 * @param options.analytics.event - The analytics event to emit when updating from user storage.
 * @param options.analytics.profileId - The profile ID for analytics.
 * @returns Promise resolving to true if local data should be pushed to user storage.
 */
export async function compareAndSyncMetadata<T>({
  context,
  localMetadata,
  userStorageMetadata,
  applyLocalUpdate,
  analytics,
}: {
  context: AccountSyncingContext;
  localMetadata?: { value?: T; lastUpdatedAt?: number };
  userStorageMetadata?: { value?: T; lastUpdatedAt?: number };
  applyLocalUpdate: (value: T) => Promise<void> | void;
  analytics?: {
    event: MultichainAccountSyncingAnalyticsEvent;
    profileId: string;
  };
}): Promise<boolean> {
  const localValue = localMetadata?.value;
  const localTimestamp = localMetadata?.lastUpdatedAt;
  const userStorageValue = userStorageMetadata?.value;
  const userStorageTimestamp = userStorageMetadata?.lastUpdatedAt;

  const isValueDifferent = localValue !== userStorageValue;

  if (!isValueDifferent) {
    return false; // No sync needed, values are the same
  }

  const isUserStorageMoreRecent =
    localTimestamp &&
    userStorageTimestamp &&
    localTimestamp < userStorageTimestamp;

  // Auto-detect validation based on local metadata type
  const isUserStorageValueValid =
    typeof localValue === 'string'
      ? typeof userStorageValue === 'string' && userStorageValue.length > 0
      : typeof userStorageValue === typeof localValue;

  if (isUserStorageMoreRecent && isUserStorageValueValid) {
    // User storage is more recent and valid, apply it locally
    await applyLocalUpdate(userStorageValue as T);

    // Emit analytics event if provided
    if (analytics) {
      context.emitAnalyticsEventFn({
        action: analytics.event,
        profileId: analytics.profileId,
      });
    }

    return false; // Don't push to user storage since we just pulled from it
  }

  return true; // Local is more recent or user storage is invalid, should push to user storage
}
