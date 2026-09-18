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
 * and UI routing based on this status. See
 * [the client guide](./docs/0002-seedless-password-change-recovery-client-guide.md).
 */
export enum PasswordSyncStatus {
  /** The local and remote passwords are synchronized; no recovery action is needed. Unlock normally. */
  InSync = 'in-sync',
  /** No lifecycle is in flight but the remote password changed (e.g. another device changed it). Prompt for the new password, then call `reconcilePassword`. */
  PasswordOutdated = 'password-outdated',
  /** Remote committed (or the local Seedless side still needs the new password). Prompt for the new password, then call `reconcilePassword`. */
  EnterNewPassword = 'enter-new-password',
  /** The Seedless side is reconciled (checkpoint is `LOCAL_PASSWORD_PENDING`). The client must cryptographically classify the local Keyring and run the old/new branch. */
  ReconcileKeyring = 'reconcile-keyring',
  /** Checkpoint is `KEY_SYNC_PENDING`. The client must export, store, and sync the current Keyring encryption key, then call `completePasswordChange`. */
  SyncKey = 'sync-key',
  /** The remote or local state could not be established. Keep the wallet locked. The last known checkpoint is preserved. */
  Unknown = 'unknown',
}

export enum SeedlessOnboardingControllerErrorMessage {
  ControllerLocked = `${controllerName} - The operation cannot be completed while the controller is locked.`,
  VaultLocked = `${controllerName} - The operation cannot be completed while the vault is locked.`,
  AuthenticationError = `${controllerName} - Authentication error`,
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
  InvalidSecretMetadata = `${controllerName} - Invalid secret metadata`,
  MissingKeyringId = `${controllerName} - Keyring ID is required to store SRP backups.`,
  FailedToEncryptAndStoreSecretData = `${controllerName} - Failed to encrypt and store secret data`,
  FailedToFetchSecretMetadata = `${controllerName} - Failed to fetch secret metadata`,
  NoSecretDataFound = `${controllerName} - No secret data found`,
  InvalidPrimarySecretDataType = `${controllerName} - Primary secret data must be of type mnemonic.`,
  FailedToChangePassword = `${controllerName} - Failed to change password`,
  PasswordChangeInProgress = `${controllerName} - A password change is already in progress; recovery must finish before starting a new one`,
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
}
