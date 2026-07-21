import type { BridgeStatusControllerMessenger } from '../types';

export const getJwt = async (
  messenger: BridgeStatusControllerMessenger,
): Promise<string | undefined> => {
  try {
    const token = await messenger.call(
      'AuthenticationController:getBearerToken',
    );
    return token;
  } catch (error) {
    console.error('Error getting JWT token for bridge-api request', error);
    return undefined;
  }
};
