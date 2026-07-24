import { AuthenticationController } from './AuthenticationController.js';

export { AuthenticationController as Controller };
export default AuthenticationController;
export * from './AuthenticationController.js';
export * as Mocks from './mocks/index.js';
export { authenticationControllerSelectors } from './selectors.js';

export type {
  AuthenticationControllerPerformSignInAction,
  AuthenticationControllerPerformSignOutAction,
  AuthenticationControllerGetBearerTokenAction,
  AuthenticationControllerGetSessionProfileAction,
  AuthenticationControllerRefreshCanonicalProfileIdAction,
  AuthenticationControllerGetUserProfileLineageAction,
  AuthenticationControllerIsSignedInAction,
  AuthenticationControllerRequestProfilePairingAction,
} from './AuthenticationController-method-action-types.js';
