export * from './sdk';

export type {
  AuthenticationControllerMessenger,
  AuthenticationControllerState,
  AuthenticationControllerActions,
  AuthenticationControllerIsSignedInAction,
  AuthenticationControllerPerformSignInAction,
  AuthenticationControllerPerformSignOutAction,
  AuthenticationControllerGetBearerTokenAction,
  AuthenticationControllerGetSessionProfileAction,
} from './AuthenticationController';

export {
  createSnapPublicKeyRequest,
  createSnapSignMessageRequest,
} from './AuthSnapRequests';

export { AuthenticationController } from './AuthenticationController';

export type {
  UserStorageControllerActions,
  UserStorageControllerMessenger,
  UserStorageControllerState,
  UserStorageControllerPerformGetStorageAction,
  UserStorageControllerPerformSetStorageAction,
  UserStorageControllerGetStorageKeyAction,
  UserStorageControllerEnableProfileSyncingAction,
  UserStorageControllerDisableProfileSyncingAction,
} from './UserStorageController';

export { UserStorageController } from './UserStorageController';
export * from './mocks';
