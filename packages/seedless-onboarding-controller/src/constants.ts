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

export enum SeedlessOnboardingControllerErrorMessage {
  ControllerLocked = `${controllerName} - The operation cannot be completed while the controller is locked.`,
  VaultLocked = `${controllerName} - The operation cannot be completed while the vault is locked.`,
  AuthenticationError = `${controllerName} - Authentication error`,
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

export const SeedlessIdentityMismatchEventName =
  'Seedless Onboarding Identity Mismatch';

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

/**
 * Detail strings for {@link SeedlessOnboardingControllerErrorMessage.IdentityMismatch}.
 */
export const IdentityMismatchDetail = {
  MissingUserId: 'The user ID is missing.',
  MissingIdToken: 'The idToken is missing.',
  UndecodableIdToken: 'The idToken could not be decoded.',
  UserIdMismatch: 'The idToken user id does not match the provided userId.',
  IdentityChangedInFlight:
    'Controller identity changed while the request was in flight.',
} as const;

export const IDENTITY_MISMATCH_REASON_BY_DETAIL: Record<
  string,
  SeedlessIdentityMismatchReason
> = {
  [IdentityMismatchDetail.MissingUserId]:
    SeedlessIdentityMismatchReason.MissingUserId,
  [IdentityMismatchDetail.MissingIdToken]:
    SeedlessIdentityMismatchReason.MissingIdToken,
  [IdentityMismatchDetail.UndecodableIdToken]:
    SeedlessIdentityMismatchReason.IdTokenUndecodable,
  [IdentityMismatchDetail.UserIdMismatch]:
    SeedlessIdentityMismatchReason.UserIdMismatch,
  [IdentityMismatchDetail.IdentityChangedInFlight]:
    SeedlessIdentityMismatchReason.IdentityChangedInFlight,
};
