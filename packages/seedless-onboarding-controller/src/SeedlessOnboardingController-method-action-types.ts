/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { SeedlessOnboardingController } from './SeedlessOnboardingController.js';

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
 * Run any pending seedless onboarding migrations.
 *
 * This method should be called by clients after the controller is unlocked
 * to ensure legacy data is migrated to the latest format.
 *
 * Migrations are idempotent - running this multiple times is safe.
 * The migration version is tracked in state to prevent re-running migrations.
 *
 * @returns A promise that resolves to `true` if data was actually migrated
 * (items were updated on the server), `false` otherwise.
 * @throws If the password is outdated (changed on another device).
 */
export type SeedlessOnboardingControllerRunMigrationsAction = {
  type: `SeedlessOnboardingController:runMigrations`;
  handler: SeedlessOnboardingController['runMigrations'];
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
 * Remains lifecycle-neutral: the client calls this during recovery without
 * advancing the lifecycle phase.
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
 * Clear the password-change lifecycle.
 *
 * Used after a definitive remote failure (server did not commit) or once
 * Keyring encryption-key synchronization is verified and all required local
 * writes have succeeded. The controller clears the phase so the next unlock
 * is normal.
 *
 * @returns A promise that resolves once the lifecycle has been cleared.
 */
export type SeedlessOnboardingControllerClearPasswordChangePhaseAction = {
  type: `SeedlessOnboardingController:clearPasswordChangePhase`;
  handler: SeedlessOnboardingController['clearPasswordChangePhase'];
};

/**
 * Mark the password-change lifecycle as `KEY_SYNC_PENDING`.
 *
 * Called by the client coordinator before it synchronizes the current
 * Keyring encryption key to Seedless. The controller only records the
 * boundary; it does not perform or verify synchronization.
 *
 * @returns A promise that resolves once the phase has been persisted.
 */
export type SeedlessOnboardingControllerMarkPasswordChangeKeySyncPendingAction =
  {
    type: `SeedlessOnboardingController:markPasswordChangeKeySyncPending`;
    handler: SeedlessOnboardingController['markPasswordChangeKeySyncPending'];
  };

/**
 * Resolve the current password-sync state without consuming a password.
 *
 * Merges the legacy `checkIsPasswordOutdated` read with password-change
 * recovery routing, so the client makes a single call at unlock (both on
 * page render and on password submit) and routes UI from the returned status.
 *
 * Phase handling:
 * - No phase (`undefined`): run the authoritative outdated check. `skipCache`
 * is honored, so the client can read from cache on render and force a remote
 * call on submit. Returns `InSync` or `PasswordOutdated` (another device
 * changed the remote password).
 * - `SEEDLESS_CHANGE_PENDING`: the remote outcome is ambiguous, so `skipCache`
 * is ignored and a remote check is forced. Clears the phase (remote did not
 * commit) or advances to `SEEDLESS_COMMITTED` (remote committed). Returns
 * `InSync` or `EnterNewPassword`.
 * - Other phases: return the next recovery step without mutating state.
 *
 * This method does not consume a password; the client prompts for the
 * correct password and then calls `reconcilePassword`.
 *
 * @param options - The options.
 * @param options.skipCache - Whether to bypass the outdated cache. Ignored
 * for `SEEDLESS_CHANGE_PENDING`, which always forces a remote check.
 * @returns The sync/recovery resolution. On any failure the last known phase
 * is preserved and `PasswordChangeRecoveryStatus.Unknown` is returned.
 */
export type SeedlessOnboardingControllerResolvePasswordSyncStateAction = {
  type: `SeedlessOnboardingController:resolvePasswordSyncState`;
  handler: SeedlessOnboardingController['resolvePasswordSyncState'];
};

/**
 * Reconcile the local Seedless password with the remote password.
 *
 * For `SEEDLESS_COMMITTED` or `LOCAL_KEYRING_PENDING` it re-runs the existing
 * password-sync flow (chain unlock + local vault rewrite)
 * with the new password and advances the phase to `LOCAL_KEYRING_PENDING`.
 * These operations are idempotent, so re-running them is safe whether or not
 * the local Seedless vault was already rewritten. The controller is left
 * unlocked.
 *
 * For no phase (`undefined`) it re-checks whether the remote password is
 * outdated. If it is, it runs the same password-sync flow, advances to
 * `LOCAL_KEYRING_PENDING`, and returns `ReconcileKeyring` so the client can
 * reconcile the local Keyring (e.g. after another device changed the remote
 * password). If the remote password is not outdated it is a no-op.
 *
 * The client remains responsible for the Keyring side (classifying the local
 * Keyring via `KeyringController:verifyPassword` and running the old-Keyring
 * or new-Keyring branch), because this controller does not depend on
 * `KeyringController`. See
 * [0003](./docs/0003-controller-owned-password-change-recovery-plan.md).
 *
 * @param params - The reconciliation parameters.
 * @param params.globalPassword - The current global password.
 * @returns The reconciliation result. On any failure the last known phase is
 * preserved and `PasswordChangeRecoveryStatus.Unknown` is returned.
 */
export type SeedlessOnboardingControllerReconcilePasswordAction = {
  type: `SeedlessOnboardingController:reconcilePassword`;
  handler: SeedlessOnboardingController['reconcilePassword'];
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
  | SeedlessOnboardingControllerRunMigrationsAction
  | SeedlessOnboardingControllerFetchAllSecretDataAction
  | SeedlessOnboardingControllerChangePasswordAction
  | SeedlessOnboardingControllerUpdateBackupMetadataStateAction
  | SeedlessOnboardingControllerVerifyVaultPasswordAction
  | SeedlessOnboardingControllerGetSecretDataBackupStateAction
  | SeedlessOnboardingControllerSubmitPasswordAction
  | SeedlessOnboardingControllerSetLockedAction
  | SeedlessOnboardingControllerGetIsUserAuthenticatedAction
  | SeedlessOnboardingControllerClearStateAction
  | SeedlessOnboardingControllerStoreKeyringEncryptionKeyAction
  | SeedlessOnboardingControllerLoadKeyringEncryptionKeyAction
  | SeedlessOnboardingControllerClearPasswordChangePhaseAction
  | SeedlessOnboardingControllerMarkPasswordChangeKeySyncPendingAction
  | SeedlessOnboardingControllerResolvePasswordSyncStateAction
  | SeedlessOnboardingControllerReconcilePasswordAction
  | SeedlessOnboardingControllerRefreshAuthTokensAction
  | SeedlessOnboardingControllerRotateRefreshTokenAction
  | SeedlessOnboardingControllerRevokePendingRefreshTokensAction
  | SeedlessOnboardingControllerGetAccessTokenAction
  | SeedlessOnboardingControllerCheckNodeAuthTokenExpiredAction
  | SeedlessOnboardingControllerCheckMetadataAccessTokenExpiredAction
  | SeedlessOnboardingControllerCheckAccessTokenExpiredAction;
