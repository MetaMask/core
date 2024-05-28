export * from './sdk';

export type {
  AuthenticationControllerMessenger,
  AuthenticationControllerState,
  Actions as AuthenticationControllerActions,
  AllowedActions as AuthenticationControllerAllowedActions,
  AuthenticationControllerIsSignedIn,
  AuthenticationControllerPerformSignIn,
  AuthenticationControllerPerformSignOut,
  AuthenticationControllerGetBearerToken,
  AuthenticationControllerGetSessionProfile,
} from './AuthenticationController';

export {
  createSnapPublicKeyRequest,
  createSnapSignMessageRequest,
} from './AuthSnapRequests';

export { AuthenticationController } from './AuthenticationController';

export type {
  Actions as UserStorageControllerActions,
  AllowedActions as UserStorageControllerAllowedActions,
  UserStorageControllerMessenger,
  UserStorageControllerState,
  UserStorageControllerPerformGetStorage,
  UserStorageControllerPerformSetStorage,
  UserStorageControllerGetStorageKey,
  UserStorageControllerEnableProfileSyncing,
  UserStorageControllerDisableProfileSyncing,
} from './UserStorageController';

export { UserStorageController } from './UserStorageController';
export * from './mocks';
