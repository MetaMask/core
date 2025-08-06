import type { AccountSyncingContext } from '../types';

/**
 * Retrieves the profile ID from AuthenticationController.
 *
 * @param context - The account syncing context.
 * @param entropySourceId - The optional entropy source ID.
 * @returns The profile ID associated with the session, if available.
 */
export const getProfileId = async (
  context: AccountSyncingContext,
  entropySourceId?: string,
) => {
  const sessionProfile = await context.messenger.call(
    'AuthenticationController:getSessionProfile',
    entropySourceId,
  );
  return sessionProfile?.profileId;
};
