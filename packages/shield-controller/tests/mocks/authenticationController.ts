import type { RestrictedMessenger } from '@metamask/base-controller';
import type { AuthenticationControllerGetBearerToken } from '@metamask/profile-sync-controller/auth';

/**
 *
 * @param messenger - The restricted messenger to use for communication.
 * @returns The mock subscription controller.
 */
export function createAuthenticationControllerMock(
  messenger: RestrictedMessenger<
    'AuthenticationController',
    AuthenticationControllerGetBearerToken,
    never,
    never,
    never
  >,
) {
  const controller = {
    getBearerToken: jest.fn((entropySourceId?: string): Promise<string> => {
      return Promise.resolve(`accessToken-${entropySourceId}`);
    }),
  };
  messenger.registerActionHandler(
    'AuthenticationController:getBearerToken',
    (entropySourceId?: string): Promise<string> => {
      return controller.getBearerToken(entropySourceId);
    },
  );
  return controller;
}
