import { AuthenticationController } from './AuthenticationController.js';

export { AuthenticationController as Controller };
export default AuthenticationController;
export * from './AuthenticationController.js';
export * as Mocks from './mocks/index.js';

export type {
  AuthenticationControllerPerformSignInAction,
  AuthenticationControllerExchangeSocialAccessTokenAction,
  AuthenticationControllerPerformSignOutAction,
  AuthenticationControllerGetBearerTokenAction,
  AuthenticationControllerGetSessionProfileAction,
  AuthenticationControllerRefreshCanonicalProfileIdAction,
  AuthenticationControllerGetUserProfileLineageAction,
  AuthenticationControllerIsSignedInAction,
  AuthenticationControllerRequestProfilePairingAction,
  AuthenticationControllerGetPartnerIdentityTokenAction,
  AuthenticationControllerClearStateAction,
  AuthenticationControllerRefreshEnrolledCredentialsAction,
  AuthenticationControllerRefreshSocialLoginCredentialsAction,
  AuthenticationControllerBeginCredentialEnrollmentAction,
  AuthenticationControllerCompleteCredentialEnrollmentAction,
  AuthenticationControllerBeginCredentialVerificationAction,
  AuthenticationControllerCompleteCredentialVerificationAction,
  AuthenticationControllerBeginSocialLoginVerificationAction,
  AuthenticationControllerCompleteSocialLoginVerificationAction,
  AuthenticationControllerGetVerificationTokenAction,
  AuthenticationControllerRequestMfaApprovalAction,
  AuthenticationControllerRemoveCredentialAction,
  AuthenticationControllerClearVerificationSessionAction,
} from './AuthenticationController-method-action-types.js';
