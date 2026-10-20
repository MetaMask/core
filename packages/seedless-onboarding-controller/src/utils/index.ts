export {
  assertCanChangePassword,
  assertIsValidVaultData,
  assertIsEncryptedKeyringEncryptionKeySet,
  assertIsEncryptedSeedlessEncryptionKeySet,
  assertIsPasswordOutdatedCacheValid,
  assertIsSeedlessOnboardingUserAuthenticated,
  assertIsValidPassword,
} from './assertions.js';
export { trackIncompleteMetadataBackupEvents } from './analytics.js';
export { decryptStringWithKey, encryptStringWithKey } from './encryption.js';
export type { SecretBackupData } from './secret-data-utils.js';
export {
  getDataTypeMigrationUpdates,
  getNewSocialBackupsMetadata,
  findSocialBackupMetadata,
  parseAndValidateSecretMetadataBackup,
} from './secret-data-utils.js';
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
