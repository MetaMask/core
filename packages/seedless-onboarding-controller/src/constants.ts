export const controllerName = 'SeedlessOnboardingController';

export enum Web3AuthNetwork {
  Mainnet = 'sapphire_mainnet',
  Devnet = 'sapphire_devnet',
}

export enum SeedlessOnboardingControllerError {
  AuthenticationError = `${controllerName} - Authentication error`,
  FailedToPersistOprfKey = `${controllerName} - Failed to persist OPRF key`,
  LoginFailedError = `${controllerName} - Login failed`,
  InsufficientAuthToken = `${controllerName} - Insufficient auth token`,
  InvalidEmptyPassword = `${controllerName} - Password cannot be empty.`,
  WrongPasswordType = `${controllerName} - Password must be of type string.`,
  InvalidVaultData = `${controllerName} - Invalid vault data`,
  VaultDataError = `${controllerName} - The decrypted vault has an unexpected shape.`,
  VaultError = `${controllerName} - Cannot unlock without a previous vault.`,
  InvalidSeedPhraseMetadata = `${controllerName} - Invalid seed phrase metadata`,
  FailedToEncryptAndStoreSeedPhraseBackup = `${controllerName} - Failed to encrypt and store seed phrase backup`,
  FailedToFetchSeedPhraseMetadata = `${controllerName} - Failed to fetch seed phrase metadata`,
  FailedToChangePassword = `${controllerName} - Failed to change password`,
  TooManyLoginAttempts = `${controllerName} - Too many login attempts`,
  IncorrectPassword = `${controllerName} - Incorrect password`,
}
