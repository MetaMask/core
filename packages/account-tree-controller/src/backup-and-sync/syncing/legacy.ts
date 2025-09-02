import { BackupAndSyncAnalyticsEvents } from '../analytics';
import { getProfileId } from '../authentication/utils';
import type { BackupAndSyncContext } from '../types';

/**
 * Performs legacy account syncing.
 *
 * @param context - The backup and sync context containing controller and messenger
 * @returns Promise that resolves to true if multichain syncing should continue, false otherwise.
 */
export const performLegacyAccountSyncing = async (
  context: BackupAndSyncContext,
): Promise<void> => {
  await context.messenger.call(
    'UserStorageController:syncInternalAccountsWithUserStorage',
  );

  const primarySrpProfileId = await getProfileId(context);
  context.emitAnalyticsEventFn({
    action: BackupAndSyncAnalyticsEvents.LEGACY_SYNCING_DONE,
    profileId: primarySrpProfileId,
  });
};
