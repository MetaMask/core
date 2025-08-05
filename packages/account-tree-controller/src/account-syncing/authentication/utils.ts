import type { AccountTreeControllerMessenger } from 'src/types';

export const getProfileId = async (
  messenger: AccountTreeControllerMessenger,
  entropySourceId?: string,
) => {
  const sessionProfile = await messenger.call(
    'AuthenticationController:getSessionProfile',
    entropySourceId,
  );
  return sessionProfile?.profileId;
};
