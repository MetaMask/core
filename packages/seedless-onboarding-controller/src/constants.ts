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
  VaultAlreadyExists = `${controllerName} - Vault already exists.`,
  InvalidSecretMetadata = `${controllerName} - Invalid secret metadata`,
  MissingKeyringId = `${controllerName} - Keyring ID is required to store SRP backups.`,
  FailedToEncryptAndStoreSecretData = `${controllerName} - Failed to encrypt and store secret data`,
  FailedToFetchSecretMetadata = `${controllerName} - Failed to fetch secret metadata`,
  NoSecretDataFound = `${controllerName} - No secret data found`,
  InvalidPrimarySecretDataType = `${controllerName} - Primary secret data must be of type mnemonic.`,
  FailedToChangePassword = `${controllerName} - Failed to change password`,
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
  Aal2Required = `${controllerName} - aal2 node auth tokens are missing or expired`,
  RecoveryKeyShareConflict = `${controllerName} - The recovery secret key share belongs to a different key`,
  InvalidEnvelope = `${controllerName} - Invalid key envelope`,
  EnvelopeControlRecordNotFound = `${controllerName} - No control record matches the live password key`,
  EnvelopeMigrationRequiresDataTypes = `${controllerName} - Envelope migration requires the data type migration`,
  RecoveryEnvelopeNotFound = `${controllerName} - No vault keys are sealed for the Recovery Secret`,
  RecoveryRequired = `${controllerName} - Recover with the Recovery Secret before setting the local password`,
  PasswordResetPending = `${controllerName} - The password must be reset with the vault keys before it can be synced or changed`,
  PasswordResetRequiresRecovery = `${controllerName} - The password can only be reset with the vault keys after a recovery with the Recovery Secret`,
}
