import type { SDK } from '@metamask/profile-sync-controller';

import type { BackupAndSyncContext } from '../types';

export type ProfileId = SDK.UserProfile['profileId'] | undefined;

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
): Promise<ProfileId> => {
  try {
    const sessionProfile = await context.messenger.call(
      'AuthenticationController:getSessionProfile',
      entropySourceId,
    );
    return sessionProfile.profileId;
  } catch (error) {
    context.contextualLogger.warn(`Failed to retrieve profile ID:`, error);
    return undefined;
  }
};
