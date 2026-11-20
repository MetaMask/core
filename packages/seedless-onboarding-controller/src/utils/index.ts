export {
  assertIsEncryptedKeyringEncryptionKeySet,
  assertIsEncryptedSeedlessEncryptionKeySet,
  assertIsPasswordOutdatedCacheValid,
  assertIsSeedlessOnboardingUserAuthenticated,
  assertIsValidPassword,
} from './assertions.js';
export { trackIncompleteMetadataBackupEvents } from './analytics.js';
export type { SecretBackupData } from './secret-data-utils.js';
export {
  getCreatedAtMs,
  getDataTypeMigrationUpdates,
  getNewSocialBackupsMetadata,
  isSecretDataType,
  parseAndValidateSecretMetadataBackup,
  sortNewestFirst,
  splitVaultItems,
} from './secret-data-utils.js';
export {
  compareAndGetLatestToken,
  decodeJWTToken,
  decodeNodeAuthToken,
  deserializeVaultData,
  getInvalidPrimarySecretDataTypeErrorData,
  getSecretTypeFromDataType,
  isAuthTokenError,
  isCouldNotDeriveEncryptionKeyError,
  isCouldNotDeriveThresholdAuthPubKeyError,
  isMaxKeyChainLengthError,
  isTokenNearExpiry,
  parseVaultData,
  serializeVaultData,
} from './utils.js';
