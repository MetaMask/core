export {
  assertIdTokenMatchesUserId,
  assertIdTokenMismatchAndTrackEvent,
  assertIdentityUnchanged,
  assertIdentityUnchangedAndTrackEvent,
  assertCanChangePassword,
  assertIsValidVaultData,
  assertIsEncryptedKeyringEncryptionKeySet,
  assertIsEncryptedSeedlessEncryptionKeySet,
  assertIsPasswordOutdatedCacheValid,
  assertIsSeedlessOnboardingUserAuthenticated,
  assertIsValidPassword,
} from './assertions.js';
export {
  trackIdentityMismatchEvent,
  trackIncompleteMetadataBackupEvents,
} from './analytics.js';
export { decryptStringWithKey, encryptStringWithKey } from './encryption.js';
export {
  getErrorMessageFromTOPRFErrorCode,
  InvalidPrimarySecretDataTypeError,
  isIdentityMismatchError,
  PasswordSyncError,
  RecoveryError,
  SeedlessOnboardingError,
} from './errors.js';
export { getPasswordSyncInstruction } from './checkpoint.js';
export { parseSeedlessAuthData } from './seedless-auth-data.js';
export type { SecretBackupData } from './secret-data-utils.js';
export {
  getDataTypeMigrationUpdates,
  getNewSocialBackupsMetadata,
  findSocialBackupMetadata,
  parseAndValidateSecretMetadataBackup,
} from './secret-data-utils.js';
export {
  convertUrlSafeBase64StringToBase64String,
  decodeBase64WithSafeUrlReplacements,
  decodeIdToken,
  padBase64String,
} from './token.js';
export {
  compareAndGetLatestToken,
  decodeJWTToken,
  decodeNodeAuthToken,
  deserializeVaultData,
  getInvalidPrimarySecretDataTypeErrorData,
  getLatestAccessToken,
  getSecretTypeFromDataType,
  isAuthTokenError,
  isMaxKeyChainLengthError,
  isTokenNearExpiry,
  parseVaultData,
  serializeVaultData,
} from './utils.js';
