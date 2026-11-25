export const controllerName = 'SeedlessOnboardingController';

export const PASSWORD_OUTDATED_CACHE_TTL_MS = 10_000; // 10 seconds

export enum Web3AuthNetwork {
  Mainnet = 'sapphire_mainnet',
  Devnet = 'sapphire_devnet',
}

/**
 * The type of social login provider.
 */
export enum AuthConnection {
  Google = 'google',
  Apple = 'apple',
  Telegram = 'telegram',
}

/**
 * OIDC issuer namespaces for the social login providers in
 * {@link AuthConnection}.
 */
export const AUTH_CONNECTION_BY_NAMESPACE: Record<string, AuthConnection> = {
  'https://accounts.google.com': AuthConnection.Google,
  'https://appleid.apple.com': AuthConnection.Apple,
  'https://oauth.telegram.org': AuthConnection.Telegram,
};

export enum SecretType {
  Mnemonic = 'mnemonic',
  PrivateKey = 'privateKey',
}

export enum SeedlessOnboardingMigrationVersion {
  V1 = 1,
}

/**
 * The stateful Seedless Onboarding operation tracked by the lifecycle record.
 *
 * The operation identifies the workflow, while the checkpoint identifies the
 * recoverable boundary within that workflow.
 */
export enum SeedlessOnboardingOperation {
  PasswordChange = 'PASSWORD_CHANGE',
  PasswordSync = 'PASSWORD_SYNC',
  CreateNewAccount = 'CREATE_NEW_ACCOUNT',
  AddNewSecretData = 'ADD_NEW_SECRET_DATA',
}

export const PASSWORD_RECOVERY_OPERATIONS = new Set([
  SeedlessOnboardingOperation.PasswordChange,
  SeedlessOnboardingOperation.PasswordSync,
]);

/**
 * Shared lifecycle checkpoints for stateful Seedless Onboarding TOPRF
 * operations.
 *
 * These checkpoints are recovery signals only — they are not proof that a
 * remote or local operation completed. Recovery must always verify actual
 * remote and local state before acting on a checkpoint.
 */
export enum SeedlessOnboardingCheckpoint {
  LocalKeyPending = 'LOCAL_KEY_PENDING',
  RemoteSecretPending = 'REMOTE_SECRET_PENDING',
  RemoteKeyPending = 'REMOTE_KEY_PENDING',
  RemotePasswordPending = 'REMOTE_PASSWORD_PENDING',
  LocalStatePending = 'LOCAL_STATE_PENDING',
  LocalPasswordPending = 'LOCAL_PASSWORD_PENDING',
  KeySyncPending = 'KEY_SYNC_PENDING',
}

/**
 * The persisted lifecycle record for a stateful Seedless Onboarding
 * operation.
 */
export type SeedlessOperationLifecycle = {
  operation: SeedlessOnboardingOperation;
  checkpoint: SeedlessOnboardingCheckpoint;
};

/**
 * The next step for the client after a password-sync or password-change
 * recovery check. Returned by `resolvePasswordSyncState` (read + resolve, no
 * password) and `reconcilePassword` (apply, with password).
 *
 * Covers both an interrupted local password change and an another-device
 * password change. The controller owns Seedless-side sequencing; the client
 * owns the Keyring-side steps (it must call `KeyringController` directly)
 * and UI routing based on this instruction. See
 * [the password sync flow](../docs/0002-seedless-password-sync-flow.md).
 */
export enum PasswordSyncInstruction {
  /**
   * No password change activities on other devices.
   * Even if the last password change has failed, no commitment has done on the remote server.
   * The local and remote passwords are synchronized and no recovery checkpoint
   * remains actionable; no recovery action is needed. Unlock normally.
   */
  InSync = 'in-sync',
  /**
   * The remote password changed due to
   *    - another device changed it.
   *    - the last password change has failed, but commitment has done in the server.
   *
   * The remote password is newer than the local state. This can occur with
   * any password recovery checkpoint when another device changes the
   * password during recovery. Prompt for the new password, then call
   * `reconcilePassword`.
   */
  PasswordOutdated = 'password-outdated',
  /**
   * Prompt for the new password.
   * The Seedless vault is reconciled (checkpoint is `LOCAL_PASSWORD_PENDING`).
   * The client needs to unlock Seedless vault with new password.
   * Recover current keyring and call the Keyring:changePassword.
   */
  ReconcileKeyring = 'reconcile-keyring',
  /**
   * Prompt for the new password.
   * Checkpoint is `KEY_SYNC_PENDING`.
   * The client must enter new password to unlock both Keyring and Seedless vault.
   * After that, must sync Keyring Encryption Key to seedless vault.
   */
  SyncKey = 'sync-key',
  /**
   * Last resort instruction for the `KEY_SYNC_PENDING` checkpoint with remote password outdated. (Changed from another device)
   * A rare edge case specified in the docs/0002-seedless-password-sync-flow.md#key_sync_pending-edge-case.
   * The client must do "Wallet reset" to recover social login in the current device.
   */
  WalletResetRequired = 'wallet-reset-required',
}

export enum SeedlessOnboardingControllerErrorMessage {
  ControllerLocked = `${controllerName} - The operation cannot be completed while the controller is locked.`,
  VaultLocked = `${controllerName} - The operation cannot be completed while the vault is locked.`,
  AuthenticationError = `${controllerName} - Authentication error`,
  UserAlreadyAuthenticated = `${controllerName} - A different user or verifier is already authenticated; call clearState before authenticating another user`,
  IdentityMismatch = `${controllerName} - Identity mismatch between idToken and user ID`,
  MissingAuthUserInfo = `${controllerName} - Missing authenticated user information`,
  FailedToPersistOprfKey = `${controllerName} - Failed to persist OPRF key`,
  LoginFailedError = `${controllerName} - Login failed`,
  InsufficientAuthToken = `${controllerName} - Insufficient auth token`,
  InvalidRefreshToken = `${controllerName} - Invalid refresh token`,
  InvalidRevokeToken = `${controllerName} - Invalid revoke token`,
  InvalidAccessToken = `${controllerName} - Invalid access token`,
  InvalidMetadataAccessToken = `${controllerName} - Invalid metadata access token`,
  MissingCredentials = `${controllerName} - Cannot unlock vault without password and encryption key`,
  ExpiredCredentials = `${controllerName} - Encryption key and salt provided are expired`,
  InvalidEmptyPassword = `${controllerName} - Password cannot be empty.`,
  WrongPasswordType = `${controllerName} - Password must be of type string.`,
  InvalidVaultData = `${controllerName} - Invalid vault data`,
  VaultDataError = `${controllerName} - The decrypted vault has an unexpected shape.`,
  VaultError = `${controllerName} - Cannot unlock without a previous vault.`,
  VaultAlreadyExists = `${controllerName} - Vault already exists.`,
  InvalidSecretMetadata = `${controllerName} - Invalid secret metadata`,
  MissingKeyringId = `${controllerName} - Keyring ID is required to store SRP backups.`,
  FailedToEncryptAndStoreSecretData = `${controllerName} - Failed to encrypt and store secret data`,
  FailedToFetchSecretMetadata = `${controllerName} - Failed to fetch secret metadata`,
  NoSecretDataFound = `${controllerName} - No secret data found`,
  InvalidPrimarySecretDataType = `${controllerName} - Primary secret data must be of type mnemonic.`,
  FailedToChangePassword = `${controllerName} - Failed to change password`,
  PasswordChangeInProgress = `${controllerName} - A password change is already in progress; recovery must finish before starting a new one`,
  OperationInProgress = `${controllerName} - Another Seedless Onboarding operation is already in progress; recovery must finish before starting a new one`,
  InvalidPasswordSyncCheckpoint = `${controllerName} - Invalid password sync checkpoint`,
  TooManyLoginAttempts = `${controllerName} - Too many login attempts`,
  IncorrectPassword = `${controllerName} - Incorrect password`,
  OutdatedPassword = `${controllerName} - Outdated password`,
  CouldNotRecoverPassword = `${controllerName} - Could not recover password`,
  SRPNotBackedUpError = `${controllerName} - SRP not backed up`,
  EncryptedKeyringEncryptionKeyNotSet = `${controllerName} - Encrypted keyring encryption key is not set`,
  EncryptedSeedlessEncryptionKeyNotSet = `${controllerName} - Encrypted seedless encryption key is not set`,
  MaxKeyChainLengthExceeded = `${controllerName} - Max key chain length exceeded`,
  FailedToFetchAuthPubKey = `${controllerName} - Failed to fetch latest auth pub key`,
  InvalidPasswordOutdatedCache = `${controllerName} - Invalid password outdated cache provided.`,
  FailedToRefreshJWTTokens = `${controllerName} - Failed to refresh JWT tokens`,
  PrimarySrpCannotBeAddedViaAddNewSecretData = `${controllerName} - PrimarySrp cannot be added via addNewSecretData. Use createToprfKeyAndBackupSeedPhrase instead.`,
  InvalidSecretDataType = `${controllerName} - Invalid secret data type`,
  Aal2Required = `${controllerName} - aal2 node auth tokens are missing or expired`,
  RecoveryKeyShareConflict = `${controllerName} - The recovery secret key share belongs to a different key`,
  InvalidEnvelope = `${controllerName} - Invalid key envelope`,
  EnvelopeControlRecordNotFound = `${controllerName} - No control record matches the live password key`,
  EnvelopeVaultRequiresEnvelopePasswordChange = `${controllerName} - Vault has envelope control records; use the envelope password change`,
  EnvelopeMigrationRequiresDataTypes = `${controllerName} - Envelope migration requires the data type migration`,
  EnvelopeMigrationInconsistent = `${controllerName} - Envelope migration is inconsistent: the vault has a control record but no recovery key is registered`,
  EnvelopeMigrationDisabled = `${controllerName} - Envelope migration is disabled`,
  InvalidRecoverySecret = `${controllerName} - The Recovery Secret must be a 32-byte Uint8Array`,
  RecoveryEnvelopeNotFound = `${controllerName} - No vault keys are sealed for the Recovery Secret`,
  PasswordEnvelopeNotFound = `${controllerName} - No vault keys are sealed for the password`,
  PasswordResetRequiresRecovery = `${controllerName} - The password can only be reset with the vault keys after a recovery with the Recovery Secret`,
}

export const SeedlessPrimarySrpMissingEventName =
  'Seedless Onboarding Primary SRP Missing';
export const SeedlessPrimarySrpMismatchEventName =
  'Seedless Onboarding Primary SRP Mismatch';
export const SeedlessIdentityMismatchEventName =
  'Seedless Onboarding Identity Mismatch';

/**
 * HMAC key for user ids on the identity-mismatch event.
 * The same user id always hashes to the same value. The raw id is not sent.
 */
export const SeedlessIdentityUserIdSalt =
  'metamask-seedless-onboarding-identity-mismatch-v1';

/**
 * Flow that detected an identity mismatch.
 */
export enum SeedlessIdentityMismatchSource {
  ToprfAuthenticate = 'toprf_authenticate',
  TokenRefresh = 'token_refresh',
  RotateRefreshToken = 'rotate_refresh_token',
}

/**
 * Non-sensitive reason sent with the identity-mismatch analytics event.
 */
export enum SeedlessIdentityMismatchReason {
  MissingUserId = 'missing_user_id',
  MissingIdToken = 'missing_id_token',
  IdTokenUndecodable = 'id_token_undecodable',
  UserIdMismatch = 'user_id_mismatch',
  IdentityChangedInFlight = 'identity_changed_in_flight',
  Unknown = 'unknown',
}
