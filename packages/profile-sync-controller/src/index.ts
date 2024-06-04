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
  UserStorageControllerGetStorageKeyAction,
  UserStorageControllerPerformGetStorageAction,
  UserStorageControllerPerformSetStorageAction,
  UserStorageControllerEnableProfileSyncingAction,
  UserStorageControllerDisableProfileSyncingAction,
} from './UserStorageController';

export { UserStorageController } from './UserStorageController';
export * from '../tests/mocks';
