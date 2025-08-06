import type { AccountSyncingContext } from '../types';

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
