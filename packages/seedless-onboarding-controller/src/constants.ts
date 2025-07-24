export const controllerName = 'SeedlessOnboardingController';

export const PASSWORD_OUTDATED_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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
}

export enum SecretType {
  Mnemonic = 'mnemonic',
  PrivateKey = 'privateKey',
}

export enum SecretMetadataVersion {
  V1 = 'v1',
}

export enum SeedlessOnboardingControllerErrorMessage {
  ControllerLocked = `${controllerName} - The operation cannot be completed while the controller is locked.`,
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
  TooManyLoginAttempts = `${controllerName} - Too many login attempts`,
  IncorrectPassword = `${controllerName} - Incorrect password`,
  OutdatedPassword = `${controllerName} - Outdated password`,
  CouldNotRecoverPassword = `${controllerName} - Could not recover password`,
  SRPNotBackedUpError = `${controllerName} - SRP not backed up`,
  EncryptedKeyringEncryptionKeyNotSet = `${controllerName} - Encrypted keyring encryption key is not set`,
  EncryptedSeedlessEncryptionKeyNotSet = `${controllerName} - Encrypted seedless encryption key is not set`,
  VaultEncryptionKeyUndefined = `${controllerName} - Vault encryption key is not available`,
  MaxKeyChainLengthExceeded = `${controllerName} - Max key chain length exceeded`,
  FailedToFetchAuthPubKey = `${controllerName} - Failed to fetch latest auth pub key`,
}
