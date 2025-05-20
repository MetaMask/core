export const controllerName = 'SeedlessOnboardingController';

export const PASSWORD_OUTDATED_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export enum Web3AuthNetwork {
  Mainnet = 'sapphire_mainnet',
  Devnet = 'sapphire_devnet',
}

// user social login provider
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

export enum SeedlessOnboardingControllerError {
  ControllerLocked = `${controllerName} - The operation cannot be completed while the controller is locked.`,
  AuthenticationError = `${controllerName} - Authentication error`,
  MissingAuthUserInfo = `${controllerName} - Missing authenticated user information`,
  FailedToPersistOprfKey = `${controllerName} - Failed to persist OPRF key`,
  LoginFailedError = `${controllerName} - Login failed`,
  InsufficientAuthToken = `${controllerName} - Insufficient auth token`,
  MissingCredentials = `${controllerName} - Cannot unlock vault without password and encryption key`,
  ExpiredCredentials = `${controllerName} - Encryption key and salt provided are expired`,
  InvalidEmptyPassword = `${controllerName} - Password cannot be empty.`,
  WrongPasswordType = `${controllerName} - Password must be of type string.`,
  InvalidVaultData = `${controllerName} - Invalid vault data`,
  VaultDataError = `${controllerName} - The decrypted vault has an unexpected shape.`,
  VaultError = `${controllerName} - Cannot unlock without a previous vault.`,
  InvalidSecretMetadata = `${controllerName} - Invalid secret metadata`,
  FailedToEncryptAndStoreSeedPhraseBackup = `${controllerName} - Failed to encrypt and store seed phrase backup`,
  FailedToFetchSeedPhraseMetadata = `${controllerName} - Failed to fetch seed phrase metadata`,
  FailedToChangePassword = `${controllerName} - Failed to change password`,
  TooManyLoginAttempts = `${controllerName} - Too many login attempts`,
  IncorrectPassword = `${controllerName} - Incorrect password`,
  OutdatedPassword = `${controllerName} - Outdated password`,
  CouldNotRecoverPassword = `${controllerName} - Could not recover password`,
  SRPNotBackedUpError = `${controllerName} - SRP not backed up`,
}
