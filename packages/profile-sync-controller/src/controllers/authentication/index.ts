import { AuthenticationController } from './AuthenticationController';

export { AuthenticationController as Controller };
export default AuthenticationController;
export * from './AuthenticationController';
export * as Mocks from './mocks';

export type {
  AuthenticationControllerPerformSignInAction,
  AuthenticationControllerPerformSignOutAction,
  AuthenticationControllerGetBearerTokenAction,
  AuthenticationControllerGetSessionProfileAction,
  AuthenticationControllerGetUserProfileLineageAction,
  AuthenticationControllerIsSignedInAction,
} from './AuthenticationController-method-action-types';
