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
 * The lifecycle phase of a Seedless password-change operation.
 *
 * Used as a recovery signal only — it is not proof that a remote or local
 * operation completed. Recovery must always verify actual remote and local
 * state before acting on the phase.
 */
export enum SeedlessPasswordChangePhase {
  /** No password change is in progress. */
  Idle = 'IDLE',
  /** A password change has started but the remote Seedless result is not yet confirmed. */
  SeedlessChangePending = 'SEEDLESS_CHANGE_PENDING',
  /** The remote Seedless password change is confirmed committed. */
  SeedlessCommitted = 'SEEDLESS_COMMITTED',
  /** The local Seedless vault has been rewritten with the new password. */
  LocalKeyringPending = 'LOCAL_KEYRING_PENDING',
  /** The local Keyring encryption key has been stored; awaiting final verification. */
  KeySyncPending = 'KEY_SYNC_PENDING',
  /** The password change is fully complete and verified. */
  Complete = 'COMPLETE',
  /** The result of one or more steps could not be established. */
  Unknown = 'UNKNOWN',
}

/**
 * The outcome of a password-sync / password-change recovery step, returned by
 * `resolvePasswordSyncState` (read + resolve, no password) and
 * `recoverPasswordChange` (apply, with password).
 *
 * The controller owns the Seedless-side recovery sequencing; the client owns
 * the Keyring-side steps (it must call `KeyringController` directly) and UI
 * routing based on this status. See
 * [0004](./docs/0004-controller-owned-password-change-recovery-plan.md).
 */
export enum PasswordChangeRecoveryStatus {
  /** Remote did not commit; the phase has been cleared to `IDLE`. Unlock with the old password normally. */
  NoChange = 'no-change',
  /** Phase is `IDLE` but the remote password changed (e.g. another device changed it). Prompt for the new password, then call `recoverPasswordChange`. */
  PasswordOutdated = 'password-outdated',
  /** Remote committed (or the local Seedless side still needs the new password). Prompt for the new password, then call `recoverPasswordChange`. */
  EnterNewPassword = 'enter-new-password',
  /** The Seedless side is reconciled (phase is `LOCAL_KEYRING_PENDING`). The client must cryptographically classify the local Keyring and run the old/new branch. */
  ReconcileKeyring = 'reconcile-keyring',
  /** Phase is `KEY_SYNC_PENDING`. The client must export, store, and sync the current Keyring encryption key, then call `completePasswordChange`. */
  SyncKey = 'sync-key',
  /** Phase is `COMPLETE`. The client should clear the lifecycle to `IDLE`. */
  Complete = 'complete',
  /** The remote or local state could not be established. Keep the wallet locked. The last known phase is preserved. */
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
