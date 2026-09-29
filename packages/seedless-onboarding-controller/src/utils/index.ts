export {
  assertIsEncryptedKeyringEncryptionKeySet,
  assertIsEncryptedSeedlessEncryptionKeySet,
  assertIsPasswordOutdatedCacheValid,
  assertIsSeedlessOnboardingUserAuthenticated,
  assertIsValidPassword,
} from './assertions.js';
export { identifyIncompleteMetadataBackup } from './analytics.js';
export type { SecretBackupData } from './secret-data-utils.js';
export {
  getDataTypeMigrationUpdates,
  getNewSocialBackupsMetadata,
  parseAndSortSecretMetadata,
} from './secret-data-utils.js';
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
