export {
  assertIdTokenMatchesUserId,
  assertIdTokenMismatchAndTrackEvent,
  assertIdentityUnchanged,
  assertIdentityUnchangedAndTrackEvent,
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
export type { SecretBackupData } from './secret-data-utils.js';
export {
  getDataTypeMigrationUpdates,
  getNewSocialBackupsMetadata,
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
  getSecretTypeFromDataType,
  isAuthTokenError,
  isMaxKeyChainLengthError,
  isTokenNearExpiry,
  parseVaultData,
  serializeVaultData,
} from './utils.js';
