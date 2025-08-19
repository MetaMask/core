import type { BackupAndSyncContext } from '../types';

/**
 * Retrieves the profile ID from AuthenticationController.
 *
 * @param context - The backup and sync context.
 * @param entropySourceId - The optional entropy source ID.
 * @returns The profile ID associated with the session, if available.
 */
export const getProfileId = async (
  context: BackupAndSyncContext,
  entropySourceId?: string,
) => {
  const sessionProfile = await context.messenger.call(
    'AuthenticationController:getSessionProfile',
    entropySourceId,
  );
  return sessionProfile?.profileId;
};
