/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { SeedlessOnboardingController } from './SeedlessOnboardingController';

export type SeedlessOnboardingControllerFetchMetadataAccessCredsAction = {
  type: `SeedlessOnboardingController:fetchMetadataAccessCreds`;
  handler: SeedlessOnboardingController['fetchMetadataAccessCreds'];
};

/**
 * Gets the node details for the TOPRF operations.
 * This function can be called to get the node endpoints, indexes and pubkeys and cache them locally.
 */
export type SeedlessOnboardingControllerPreloadToprfNodeDetailsAction = {
  type: `SeedlessOnboardingController:preloadToprfNodeDetails`;
  handler: SeedlessOnboardingController['preloadToprfNodeDetails'];
};

/**
 * Authenticate OAuth user using the seedless onboarding flow
 * and determine if the user is already registered or not.
 *
 * @param params - The parameters for authenticate OAuth user.
 * @param params.idTokens - The ID token(s) issued by OAuth verification service. Currently this array only contains a single idToken which is verified by all the nodes, in future we are considering to issue a unique idToken for each node.
 * @param params.authConnection - The social login provider.
 * @param params.authConnectionId - OAuth authConnectionId from dashboard
 * @param params.userId - user email or id from Social login
 * @param params.groupedAuthConnectionId - Optional grouped authConnectionId to be used for the authenticate request.
 * @param params.socialLoginEmail - The user email from Social login.
 * @param params.refreshToken - Refresh token issued during OAuth login. Written to state when provided.
 * @param params.revokeToken - revoke token for revoking refresh token and get new refresh token and new revoke token.
 * @param params.accessToken - Access token for pairing with profile sync auth service and to access other services.
 * @param params.metadataAccessToken - Metadata access token for accessing the metadata service before the vault is created or unlocked.
 * @param params.skipLock - Optional flag to skip acquiring the controller lock. (to prevent deadlock in case the caller already acquired the lock)
 * @returns A promise that resolves to the authentication result.
 */
export type SeedlessOnboardingControllerAuthenticateAction = {
  type: `SeedlessOnboardingController:authenticate`;
  handler: SeedlessOnboardingController['authenticate'];
};

/**
 * Create a new TOPRF encryption key using given password and backups the provided seed phrase.
 *
 * @param password - The password used to create new wallet and seedphrase
 * @param seedPhrase - The initial seed phrase (Mnemonic) created together with the wallet.
 * @param keyringId - The keyring id of the backup seed phrase
 * @returns A promise that resolves to the encrypted seed phrase and the encryption key.
 */
export type SeedlessOnboardingControllerCreateToprfKeyAndBackupSeedPhraseAction =
  {
    type: `SeedlessOnboardingController:createToprfKeyAndBackupSeedPhrase`;
    handler: SeedlessOnboardingController['createToprfKeyAndBackupSeedPhrase'];
  };

/**
 * Encrypt and add a new secret data to the metadata store.
 *
 * @param data - The data to add.
 * @param dataType - The data type classification for the secret data.
 * @param options - Optional options object, which includes optional data to be added to the metadata store.
 * @param options.keyringId - The keyring id of the backup keyring (SRP).
 * @returns A promise that resolves to the success of the operation.
 */
export type SeedlessOnboardingControllerAddNewSecretDataAction = {
  type: `SeedlessOnboardingController:addNewSecretData`;
  handler: SeedlessOnboardingController['addNewSecretData'];
};

/**
 * Fetches all secret data items from the metadata store.
 *
 * Decrypts the secret data and returns the decrypted secret data using the recovered encryption key from the password.
 *
 * @param password - The optional password used to create new wallet. If not provided, `cached Encryption Key` will be used.
 * @returns A promise that resolves to the secret metadata items.
 */
export type SeedlessOnboardingControllerFetchAllSecretDataAction = {
  type: `SeedlessOnboardingController:fetchAllSecretData`;
  handler: SeedlessOnboardingController['fetchAllSecretData'];
};

/**
 * Update the password of the seedless onboarding flow.
 *
 * Changing password will also update the encryption key, metadata store and the vault with new encrypted values.
 *
 * @param newPassword - The new password to update.
 * @param oldPassword - The old password to verify.
 * @returns A promise that resolves to the success of the operation.
 */
export type SeedlessOnboardingControllerChangePasswordAction = {
  type: `SeedlessOnboardingController:changePassword`;
  handler: SeedlessOnboardingController['changePassword'];
};

/**
 * Update the backup metadata state for the given secret data.
 *
 * @param secretData - The data to backup, can be a single backup or array of backups.
 * @param secretData.keyringId - The keyring id associated with the backup secret data.
 * @param secretData.data - The secret data to update the backup metadata state.
 */
export type SeedlessOnboardingControllerUpdateBackupMetadataStateAction = {
  type: `SeedlessOnboardingController:updateBackupMetadataState`;
  handler: SeedlessOnboardingController['updateBackupMetadataState'];
};

/**
 * Verify the password validity by decrypting the vault.
 *
 * @param password - The password to verify.
 * @param options - Optional options object.
 * @param options.skipLock - Whether to skip the lock acquisition. (to prevent deadlock in case the caller already acquired the lock)
 * @returns A promise that resolves to the success of the operation.
 * @throws {Error} If the password is invalid or the vault is not initialized.
 */
export type SeedlessOnboardingControllerVerifyVaultPasswordAction = {
  type: `SeedlessOnboardingController:verifyVaultPassword`;
  handler: SeedlessOnboardingController['verifyVaultPassword'];
};

/**
 * Get backup state of the given secret data, from the controller state.
 *
 * If the given secret data is not backed up and not found in the state, it will return `undefined`.
 *
 * @param data - The data to get the backup state of.
 * @param type - The type of the secret data.
 * @returns The backup state of the given secret data.
 */
export type SeedlessOnboardingControllerGetSecretDataBackupStateAction = {
  type: `SeedlessOnboardingController:getSecretDataBackupState`;
  handler: SeedlessOnboardingController['getSecretDataBackupState'];
};

/**
 * Submit the password to the controller, verify the password validity and unlock the controller.
 *
 * This method will be used especially when user unlock the wallet.
 * The provided password will be verified against the encrypted vault, encryption key will be derived and saved in the controller state.
 *
 * This operation is useful when user performs some actions that requires the user password/encryption key. e.g. add new srp backup
 *
 * @param password - The password to submit.
 * @returns A promise that resolves to the success of the operation.
 */
export type SeedlessOnboardingControllerSubmitPasswordAction = {
  type: `SeedlessOnboardingController:submitPassword`;
  handler: SeedlessOnboardingController['submitPassword'];
};

/**
 * Set the controller to locked state, and deallocate the secrets (vault encryption key and salt).
 *
 * When the controller is locked, the user will not be able to perform any operations on the controller/vault.
 *
 * @returns A promise that resolves to the success of the operation.
 */
export type SeedlessOnboardingControllerSetLockedAction = {
  type: `SeedlessOnboardingController:setLocked`;
  handler: SeedlessOnboardingController['setLocked'];
};

/**
 * Sync the latest global password to the controller.
 * reset vault with latest globalPassword,
 * persist the latest global password authPubKey
 *
 * @param params - The parameters for syncing the latest global password.
 * @param params.globalPassword - The latest global password.
 * @returns A promise that resolves to the success of the operation.
 */
export type SeedlessOnboardingControllerSyncLatestGlobalPasswordAction = {
  type: `SeedlessOnboardingController:syncLatestGlobalPassword`;
  handler: SeedlessOnboardingController['syncLatestGlobalPassword'];
};

/**
 * @description Unlock the controller with the latest global password.
 *
 * @param params - The parameters for unlocking the controller.
 * @param params.maxKeyChainLength - The maximum chain length of the pwd encryption keys.
 * @param params.globalPassword - The latest global password.
 * @returns A promise that resolves to the success of the operation.
 */
export type SeedlessOnboardingControllerSubmitGlobalPasswordAction = {
  type: `SeedlessOnboardingController:submitGlobalPassword`;
  handler: SeedlessOnboardingController['submitGlobalPassword'];
};

/**
 * @description Check if the current password is outdated compare to the global password.
 *
 * @param options - Optional options object.
 * @param options.globalAuthPubKey - The global auth public key to compare with the current auth public key.
 * If not provided, the global auth public key will be fetched from the backend.
 * @param options.skipCache - If true, bypass the cache and force a fresh check.
 * @param options.skipLock - Whether to skip the lock acquisition. (to prevent deadlock in case the caller already acquired the lock)
 * @returns A promise that resolves to true if the password is outdated, false otherwise.
 */
export type SeedlessOnboardingControllerCheckIsPasswordOutdatedAction = {
  type: `SeedlessOnboardingController:checkIsPasswordOutdated`;
  handler: SeedlessOnboardingController['checkIsPasswordOutdated'];
};

/**
 * Check if the user is authenticated with the seedless onboarding flow by checking the token values in the state.
 *
 * This method will check the `accessToken` and `revokeToken` in the state, besides the social login authentication details.
 * If both are present, the user is authenticated.
 * If either is missing, the user is not authenticated.
 *
 * This method is useful when we want to check if the state has valid authenticated user details to perform vault creations.
 *
 * @returns True if the user is authenticated, false otherwise.
 */
export type SeedlessOnboardingControllerGetIsUserAuthenticatedAction = {
  type: `SeedlessOnboardingController:getIsUserAuthenticated`;
  handler: SeedlessOnboardingController['getIsUserAuthenticated'];
};

/**
 * Clears the current state of the SeedlessOnboardingController.
 */
export type SeedlessOnboardingControllerClearStateAction = {
  type: `SeedlessOnboardingController:clearState`;
  handler: SeedlessOnboardingController['clearState'];
};

/**
 * Store the keyring encryption key in state, encrypted under the current
 * encryption key.
 *
 * @param keyringEncryptionKey - The keyring encryption key.
 */
export type SeedlessOnboardingControllerStoreKeyringEncryptionKeyAction = {
  type: `SeedlessOnboardingController:storeKeyringEncryptionKey`;
  handler: SeedlessOnboardingController['storeKeyringEncryptionKey'];
};

/**
 * Load the keyring encryption key from state, decrypted under the current
 * encryption key.
 *
 * @returns The keyring encryption key.
 */
export type SeedlessOnboardingControllerLoadKeyringEncryptionKeyAction = {
  type: `SeedlessOnboardingController:loadKeyringEncryptionKey`;
  handler: SeedlessOnboardingController['loadKeyringEncryptionKey'];
};

/**
 * Refresh expired nodeAuthTokens, accessToken, and metadataAccessToken using
 * the stored refresh token.
 *
 * Concurrent callers share a single in-flight HTTP request — if a refresh is
 * already in-progress the returned promise resolves when that request settles
 * rather than firing a duplicate request with the same token.
 *
 * @returns A promise that resolves when the tokens have been refreshed.
 */
export type SeedlessOnboardingControllerRefreshAuthTokensAction = {
  type: `SeedlessOnboardingController:refreshAuthTokens`;
  handler: SeedlessOnboardingController['refreshAuthTokens'];
};

/**
 * Rotate the refresh token — fetch a new refresh/revoke token pair from the
 * auth service and persist the new revoke token in the vault.
 *
 * This method should be called after a successful JWT refresh.
 *
 * @returns A Promise that resolves to void.
 */
export type SeedlessOnboardingControllerRotateRefreshTokenAction = {
  type: `SeedlessOnboardingController:rotateRefreshToken`;
  handler: SeedlessOnboardingController['rotateRefreshToken'];
};

/**
 * Revoke all pending refresh tokens.
 *
 * This method is to be called after user is authenticated.
 *
 * @returns A Promise that resolves to void.
 */
export type SeedlessOnboardingControllerRevokePendingRefreshTokensAction = {
  type: `SeedlessOnboardingController:revokePendingRefreshTokens`;
  handler: SeedlessOnboardingController['revokePendingRefreshTokens'];
};

/**
 * Get the access token from the state.
 *
 * If the tokens are expired, the method will refresh them and return the new access token.
 *
 * @returns The access token.
 */
export type SeedlessOnboardingControllerGetAccessTokenAction = {
  type: `SeedlessOnboardingController:getAccessToken`;
  handler: SeedlessOnboardingController['getAccessToken'];
};

/**
 * Check if the current node auth token is expired.
 *
 * @returns True if the current node auth token is expired, false otherwise.
 */
export type SeedlessOnboardingControllerCheckNodeAuthTokenExpiredAction = {
  type: `SeedlessOnboardingController:checkNodeAuthTokenExpired`;
  handler: SeedlessOnboardingController['checkNodeAuthTokenExpired'];
};

/**
 * Check if the current metadata access token should be refreshed.
 * Returns true when the token is expired or when less than 10% of its
 * lifetime remains (proactive refresh).
 *
 * @returns True if the metadata access token should be refreshed, false otherwise.
 */
export type SeedlessOnboardingControllerCheckMetadataAccessTokenExpiredAction =
  {
    type: `SeedlessOnboardingController:checkMetadataAccessTokenExpired`;
    handler: SeedlessOnboardingController['checkMetadataAccessTokenExpired'];
  };

/**
 * Check if the current access token should be refreshed.
 * Returns true when the token is expired or when less than 10% of its
 * lifetime remains (proactive refresh).
 * When the vault is locked, the access token is not accessible, so we return false.
 *
 * @returns True if the access token should be refreshed, false otherwise.
 */
export type SeedlessOnboardingControllerCheckAccessTokenExpiredAction = {
  type: `SeedlessOnboardingController:checkAccessTokenExpired`;
  handler: SeedlessOnboardingController['checkAccessTokenExpired'];
};

/**
 * Union of all SeedlessOnboardingController action types.
 */
export type SeedlessOnboardingControllerMethodActions =
  | SeedlessOnboardingControllerFetchMetadataAccessCredsAction
  | SeedlessOnboardingControllerPreloadToprfNodeDetailsAction
  | SeedlessOnboardingControllerAuthenticateAction
  | SeedlessOnboardingControllerCreateToprfKeyAndBackupSeedPhraseAction
  | SeedlessOnboardingControllerAddNewSecretDataAction
  | SeedlessOnboardingControllerFetchAllSecretDataAction
  | SeedlessOnboardingControllerChangePasswordAction
  | SeedlessOnboardingControllerUpdateBackupMetadataStateAction
  | SeedlessOnboardingControllerVerifyVaultPasswordAction
  | SeedlessOnboardingControllerGetSecretDataBackupStateAction
  | SeedlessOnboardingControllerSubmitPasswordAction
  | SeedlessOnboardingControllerSetLockedAction
  | SeedlessOnboardingControllerSyncLatestGlobalPasswordAction
  | SeedlessOnboardingControllerSubmitGlobalPasswordAction
  | SeedlessOnboardingControllerCheckIsPasswordOutdatedAction
  | SeedlessOnboardingControllerGetIsUserAuthenticatedAction
  | SeedlessOnboardingControllerClearStateAction
  | SeedlessOnboardingControllerStoreKeyringEncryptionKeyAction
  | SeedlessOnboardingControllerLoadKeyringEncryptionKeyAction
  | SeedlessOnboardingControllerRefreshAuthTokensAction
  | SeedlessOnboardingControllerRotateRefreshTokenAction
  | SeedlessOnboardingControllerRevokePendingRefreshTokensAction
  | SeedlessOnboardingControllerGetAccessTokenAction
  | SeedlessOnboardingControllerCheckNodeAuthTokenExpiredAction
  | SeedlessOnboardingControllerCheckMetadataAccessTokenExpiredAction
  | SeedlessOnboardingControllerCheckAccessTokenExpiredAction;
