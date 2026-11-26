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
 * @throws `UserAlreadyAuthenticated` if `mfaFlag` is enabled and a different user or verifier is already in state. Call `clearState` before authenticating another user.
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
 * Decrypts the secret data with the keys of the unlocked vault. The vault
 * and the `envelope` state are not changed.
 *
 * @returns A promise that resolves to the secret metadata items.
 */
export type SeedlessOnboardingControllerFetchAllSecretDataAction = {
  type: `SeedlessOnboardingController:fetchAllSecretData`;
  handler: SeedlessOnboardingController['fetchAllSecretData'];
};

/**
 * Restores the local vault with the global password.
 *
 * Derives the keys from `password`, fetches and decrypts the secret data,
 * and creates the local vault under `password`, replacing any existing
 * one. If the vault is envelope-managed, the password opens the vault keys
 * and the `envelope` state is set; otherwise any existing `envelope` state
 * is cleared. `isLocalPassword` and `seedlessOperationLifecycle` are cleared.
 *
 * @param params - The function parameters.
 * @param params.password - The global password.
 * @returns The secret data of the vault.
 */
export type SeedlessOnboardingControllerRestoreVaultWithPasswordAction = {
  type: `SeedlessOnboardingController:restoreVaultWithPassword`;
  handler: SeedlessOnboardingController['restoreVaultWithPassword'];
};

/**
 * Update the password of the seedless onboarding flow.
 *
 * Changing password will also update the encryption key, metadata store and the vault with new encrypted values.
 * If the vault is envelope-managed, only the password envelope and the
 * password OPRF key change; the vault keys and the backend vault stay as
 * they are.
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
 * Identify an incomplete or mismatched primary SRP backup.
 *
 * This method must only be called after the controller has been unlocked.
 *
 * @param password - The password used to export the local primary SRP.
 * @returns A promise that resolves after identification and telemetry have
 * completed.
 */
export type SeedlessOnboardingControllerIdentifyIncompleteMetadataBackupAction =
  {
    type: `SeedlessOnboardingController:identifyIncompleteMetadataBackup`;
    handler: SeedlessOnboardingController['identifyIncompleteMetadataBackup'];
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
 *
 * Waits for any in-flight controller operation before clearing state and
 * releases the in-memory decrypted vault data.
 *
 * @returns A promise that resolves once the state has been cleared.
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
 * advancing the lifecycle checkpoint.
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
 * Complete password-change recovery.
 *
 * Call this after the current Keyring encryption key has been synchronized
 * and all required local writes have succeeded. The controller clears the
 * lifecycle so the next unlock is normal.
 *
 * This only completes a lifecycle that is at `KEY_SYNC_PENDING`; in any other
 * state it is a no-op.
 *
 * @returns A promise that resolves once recovery has been completed.
 */
export type SeedlessOnboardingControllerCompletePasswordChangeAction = {
  type: `SeedlessOnboardingController:completePasswordChange`;
  handler: SeedlessOnboardingController['completePasswordChange'];
};

/**
 * Mark the password-change lifecycle as `KEY_SYNC_PENDING`.
 *
 * Called by the client coordinator before it synchronizes the current
 * Keyring encryption key to Seedless. The controller only records the
 * boundary; it does not perform or verify synchronization.
 *
 * This only advances a lifecycle that is at `LOCAL_PASSWORD_PENDING`; in any
 * other state it is a no-op.
 *
 * @returns A promise that resolves once the checkpoint has been persisted.
 */
export type SeedlessOnboardingControllerMarkPasswordChangeKeySyncPendingAction =
  {
    type: `SeedlessOnboardingController:markPasswordChangeKeySyncPending`;
    handler: SeedlessOnboardingController['markPasswordChangeKeySyncPending'];
  };

/**
 * Resolve the password-sync instruction without consuming a password.
 *
 * Checks the remote password before routing recovery for every valid
 * password-sync checkpoint. The checkpoint then determines the next local
 * recovery instruction when the passwords are in sync.
 *
 * @param options - The options.
 * @param options.skipCache - Whether to bypass the outdated cache. Recovery
 * checkpoints always bypass the cache.
 * @returns The sync/recovery instruction.
 * @throws If another operation is active or the password state cannot be
 * established.
 */
export type SeedlessOnboardingControllerResolvePasswordSyncStateAction = {
  type: `SeedlessOnboardingController:resolvePasswordSyncState`;
  handler: SeedlessOnboardingController['resolvePasswordSyncState'];
};

/**
 * Reconcile the local Seedless password with the remote password.
 *
 * For `LOCAL_STATE_PENDING` it re-runs the existing password-sync flow
 * (chain unlock + local vault rewrite) with the new password and advances
 * the checkpoint to `LOCAL_PASSWORD_PENDING`. These operations are
 * idempotent, so re-running them is safe whether or not the local Seedless
 * vault was already rewritten. The controller is left unlocked.
 *
 * For `LOCAL_PASSWORD_PENDING` or `KEY_SYNC_PENDING` the local Seedless vault
 * is already rewritten. The method unlocks it with the supplied password so
 * `loadKeyringEncryptionKey` and `storeKeyringEncryptionKey` work after a
 * restart, without repeating remote TOPRF recovery or a vault rewrite. A
 * newer `accessToken` from `refreshAuthTokens` is kept instead of being
 * overwritten by the vault copy.
 *
 * It always re-checks whether the remote password is outdated, including when
 * the local Seedless vault was already rewritten. If it is, it runs the same
 * password-sync flow, advances to `LOCAL_PASSWORD_PENDING`, and returns
 * `ReconcileKeyring` so the client can reconcile the local Keyring. If the
 * remote password is current, the checkpoint determines whether the client
 * must reconcile the Keyring, sync its key, or do nothing.
 *
 * The client remains responsible for the Keyring side (classifying the local
 * Keyring via `KeyringController:verifyPassword` and running the old-Keyring
 * or new-Keyring branch), because this controller does not depend on
 * `KeyringController`. See
 * [the password sync flow](../docs/0002-seedless-password-sync-flow.md).
 *
 * @param params - The reconciliation parameters.
 * @param params.globalPassword - The current global password.
 * @param params.maxKeyChainLength - The maximum chain length of the pwd encryption keys. @default 5
 * @returns The reconciliation instruction.
 * @throws If recovery cannot establish the current password state.
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
 * Authenticate on the recovery verifier with the aal2 token and store the
 * issued node auth tokens, the token's `exp` and `sub` (profile ID), the
 * verifier IDs, and whether a share already exists, as `recoverySession`.
 * The aal1 `nodeAuthTokens`, `accessToken` and `metadataAccessToken` are
 * left as they are.
 *
 * @param params - The function parameters.
 * @param params.aal2Token - The aal2 token minted by the authentication API.
 * Its `exp` caps the lifetime of the aal2 node auth tokens.
 * @param params.authConnectionId - The recovery sub-verifier ID.
 * @param params.groupedAuthConnectionId - The recovery aggregate verifier ID.
 * Requires a successful {@link authenticate} first, since the recovery
 * session is bound to the authenticated user.
 *
 * @returns A promise that resolves once the aal2 set is stored.
 * @throws `MissingAuthUserInfo` if the user is not authenticated, or if either
 * verifier ID is empty or not a string.
 */
export type SeedlessOnboardingControllerAuthenticateForRecoveryAction = {
  type: `SeedlessOnboardingController:authenticateForRecovery`;
  handler: SeedlessOnboardingController['authenticateForRecovery'];
};

/**
 * Migrate the vault to envelope encryption, adopting its current key set
 * as the vault key set `K_v`.
 *
 * Writes, in order: `rbek` (`K_v` sealed for the Recovery Secret) under a
 * fresh OPRF key, the OPRF key on the recovery verifier, and the control
 * record under the vault's metadata lock. The control record is the
 * commit. No data item is moved and no password is needed; the first
 * `pbek` is written by the first password change.
 *
 * Retries are safe. An unregistered `rbek` is abandoned and a new one is
 * written. If the key is registered, `K_v` is resealed when the newest
 * `rbek` does not hold it (e.g. after a legacy password change), then the
 * control record is written. On an already migrated vault, it only checks
 * the recovery verifier and reseals `K_v` if needed.
 *
 * Requires an unlocked vault whose keys derive from the global password,
 * the Recovery Secret registered at the escrows, and a valid aal2 session
 * from {@link authenticateForRecovery}.
 *
 * @param params - The function parameters.
 * @param params.recoverySecret - The 32-byte Recovery Secret held in escrow.
 * @returns A promise that resolves once the vault is envelope-managed.
 * @throws `EnvelopeMigrationDisabled` if `mfaFlag` is not enabled.
 * @throws `InvalidRecoverySecret` if `recoverySecret` is not a 32-byte
 * `Uint8Array`.
 * @throws `PasswordChangeInProgress` if a password change lifecycle is
 * active.
 * @throws `OperationInProgress` if another operation lifecycle is active.
 * @throws `OutdatedPassword` if the vault is behind the global password.
 * @throws `EnvelopeControlRecordNotFound` if no control record matching the
 * global password reads back.
 * @throws `EnvelopeMigrationInconsistent` if a control record exists but
 * the recovery verifier holds no key.
 * @throws `RecoveryKeyShareConflict` if the recovery verifier holds another
 * Recovery Secret's key.
 * @throws `InvalidEnvelope` if `rbek` does not read back.
 * @throws `Aal2Required` without a valid aal2 session.
 * @throws `EnvelopeMigrationRequiresDataTypes` before the data type
 * migration.
 */
export type SeedlessOnboardingControllerMigrateToEnvelopeAction = {
  type: `SeedlessOnboardingController:migrateToEnvelope`;
  handler: SeedlessOnboardingController['migrateToEnvelope'];
};

/**
 * Recover an envelope-managed vault with the Recovery Secret instead of the
 * password: open `rbek` to get the vault key set `K_v`, fetch the secret
 * data with it, and create the local vault under `password`.
 *
 * Intended for wallet rehydration, not while the wallet is locked. If this
 * device has `envelope` state, the recovered vault keys must be the ones
 * it names.
 *
 * `password` only encrypts the local vault. This sets `isLocalPassword`,
 * which {@link resetPasswordWithVaultKeys}, {@link changePassword} and
 * {@link reconcilePassword} clear once the password is global.
 * `envelope.passwordAuthPubKey` is set to the live password OPRF key, so
 * {@link resolvePasswordSyncState} reports a password change made elsewhere
 * after recovery.
 *
 * Authenticate with social login and call {@link authenticateForRecovery}
 * first.
 *
 * @param params - The function parameters.
 * @param params.recoverySecret - The 32-byte Recovery Secret from escrow.
 * @param params.password - The password of the new local vault.
 * @returns The secret data of the vault.
 * @throws `InvalidRecoverySecret` unless `recoverySecret` is a 32-byte
 * `Uint8Array`, before any request.
 * @throws `RecoveryEnvelopeNotFound` if no vault keys are sealed for the
 * Recovery Secret, they are not the vault keys named by the `envelope`
 * state, or the vault they open has no control record, as its migration is
 * not committed, `NoSecretDataFound` if a committed vault holds no secret
 * items, `EnvelopeControlRecordNotFound` if no control
 * record matches the live password OPRF key, since the password could never
 * be reset, `RecoveryKeyShareConflict` if the nodes hold the key of another
 * Recovery Secret, or `Aal2Required` without a valid aal2 session. No local
 * vault is created when it throws.
 */
export type SeedlessOnboardingControllerRecoverWithRecoverySecretAction = {
  type: `SeedlessOnboardingController:recoverWithRecoverySecret`;
  handler: SeedlessOnboardingController['recoverWithRecoverySecret'];
};

/**
 * Set a new global password on an envelope-managed vault without the old
 * one, after {@link recoverWithRecoverySecret}.
 *
 * Only allowed while `isLocalPassword` is set, which is the state the vault
 * is left in after {@link recoverWithRecoverySecret}, and with a valid aal2 session
 * from {@link authenticateForRecovery}. A successful reset clears
 * `isLocalPassword` and records the `LOCAL_PASSWORD_PENDING` password-change
 * lifecycle checkpoint; clients must advance and complete the lifecycle via
 * {@link markPasswordChangeKeySyncPending} and {@link completePasswordChange},
 * and after that use {@link changePassword} instead.
 *
 * The password OPRF key swap is signed with the auth key stored in the
 * vault's control record, so the old password is not needed. The vault
 * keys and the backend vault stay as they are, and the local vault is
 * re-encrypted under the new password.
 *
 * @param params - The function parameters.
 * @param params.newPassword - The new global password.
 * @returns A promise that resolves once the new password is global.
 * @throws `PasswordChangeInProgress` if a password change lifecycle is
 * active, `OperationInProgress` if another operation lifecycle is active,
 * `PasswordResetRequiresRecovery` if the vault is not
 * envelope-managed or `isLocalPassword` is not set,
 * `Aal2Required` without a valid aal2 session, or
 * `EnvelopeControlRecordNotFound` if no control record matches the live
 * password OPRF key.
 */
export type SeedlessOnboardingControllerResetPasswordWithVaultKeysAction = {
  type: `SeedlessOnboardingController:resetPasswordWithVaultKeys`;
  handler: SeedlessOnboardingController['resetPasswordWithVaultKeys'];
};

/**
 * Rotate the refresh token — fetch a new refresh/revoke token pair from the
 * auth service and persist the new revoke token in the vault.
 *
 * This method should be called after a successful JWT refresh.
 *
 * When `idTokens` are provided, their `sub` claim is checked against
 * `state.userId` before the renewal request. A mismatch throws
 * {@link SeedlessOnboardingControllerErrorMessage.IdentityMismatch} and the
 * vault revoke token is not renewed.
 *
 * @param idTokens - Id tokens from the JWT refresh. Only the first token is
 * validated. Omit when the caller has no id token to check.
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
  | SeedlessOnboardingControllerRestoreVaultWithPasswordAction
  | SeedlessOnboardingControllerChangePasswordAction
  | SeedlessOnboardingControllerUpdateBackupMetadataStateAction
  | SeedlessOnboardingControllerVerifyVaultPasswordAction
  | SeedlessOnboardingControllerGetSecretDataBackupStateAction
  | SeedlessOnboardingControllerSubmitPasswordAction
  | SeedlessOnboardingControllerIdentifyIncompleteMetadataBackupAction
  | SeedlessOnboardingControllerSetLockedAction
  | SeedlessOnboardingControllerGetIsUserAuthenticatedAction
  | SeedlessOnboardingControllerClearStateAction
  | SeedlessOnboardingControllerStoreKeyringEncryptionKeyAction
  | SeedlessOnboardingControllerLoadKeyringEncryptionKeyAction
  | SeedlessOnboardingControllerCompletePasswordChangeAction
  | SeedlessOnboardingControllerMarkPasswordChangeKeySyncPendingAction
  | SeedlessOnboardingControllerResolvePasswordSyncStateAction
  | SeedlessOnboardingControllerReconcilePasswordAction
  | SeedlessOnboardingControllerRefreshAuthTokensAction
  | SeedlessOnboardingControllerAuthenticateForRecoveryAction
  | SeedlessOnboardingControllerMigrateToEnvelopeAction
  | SeedlessOnboardingControllerRecoverWithRecoverySecretAction
  | SeedlessOnboardingControllerResetPasswordWithVaultKeysAction
  | SeedlessOnboardingControllerRotateRefreshTokenAction
  | SeedlessOnboardingControllerRevokePendingRefreshTokensAction
  | SeedlessOnboardingControllerGetAccessTokenAction
  | SeedlessOnboardingControllerCheckNodeAuthTokenExpiredAction
  | SeedlessOnboardingControllerCheckMetadataAccessTokenExpiredAction
  | SeedlessOnboardingControllerCheckAccessTokenExpiredAction;
