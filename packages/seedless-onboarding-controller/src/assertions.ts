import { SeedlessOnboardingControllerErrorMessage } from './constants';
import type { AuthenticatedUserDetails, VaultData } from './types';

/**
 * Check if the provided value is a valid authenticated user.
 *
 * @param value - The value to check.
 * @throws If the value is not a valid authenticated user.
 */
export function assertIsSeedlessOnboardingUserAuthenticated(
  value: unknown,
): asserts value is AuthenticatedUserDetails {
  if (
    !value ||
    typeof value !== 'object' ||
    !('authConnectionId' in value) ||
    typeof value.authConnectionId !== 'string' ||
    !('userId' in value) ||
    typeof value.userId !== 'string'
  ) {
    throw new Error(
      SeedlessOnboardingControllerErrorMessage.MissingAuthUserInfo,
    );
  }

  if (
    !('nodeAuthTokens' in value) ||
    typeof value.nodeAuthTokens !== 'object' ||
    !Array.isArray(value.nodeAuthTokens) ||
    value.nodeAuthTokens.length < 3 // At least 3 auth tokens are required for Threshold OPRF service
  ) {
    throw new Error(
      SeedlessOnboardingControllerErrorMessage.InsufficientAuthToken,
    );
  }

  if (!('refreshToken' in value) || typeof value.refreshToken !== 'string') {
    throw new Error(
      SeedlessOnboardingControllerErrorMessage.InvalidRefreshToken,
    );
  }
  if (
    !('metadataAccessToken' in value) ||
    typeof value.metadataAccessToken !== 'string'
  ) {
    throw new Error(
      SeedlessOnboardingControllerErrorMessage.InvalidMetadataAccessToken,
    );
  }
}

/**
 * Check if the provided value is a valid password outdated cache.
 *
 * @param value - The value to check.
 * @throws If the value is not a valid password outdated cache.
 */
export function assertIsPasswordOutdatedCacheValid(
  value: unknown,
): asserts value is number {
  if (typeof value !== 'number') {
    throw new Error(
      SeedlessOnboardingControllerErrorMessage.InvalidPasswordOutdatedCache,
    );
  }

  if (value < 0 || isNaN(value) || !isFinite(value)) {
    throw new Error(
      SeedlessOnboardingControllerErrorMessage.InvalidPasswordOutdatedCache,
    );
  }
}

/**
 * Check if the provided value is a valid vault data.
 *
 * @param value - The value to check.
 * @throws If the value is not a valid vault data.
 */
export function assertIsValidVaultData(
  value: unknown,
): asserts value is VaultData {
  // value is not valid vault data if any of the following conditions are true:
  if (
    !value || // value is not defined
    typeof value !== 'object' || // value is not an object
    !('toprfEncryptionKey' in value) || // toprfEncryptionKey is not defined
    typeof value.toprfEncryptionKey !== 'string' || // toprfEncryptionKey is not a string
    !('toprfPwEncryptionKey' in value) || // toprfPwEncryptionKey is not defined
    typeof value.toprfPwEncryptionKey !== 'string' || // toprfPwEncryptionKey is not a string
    !('toprfAuthKeyPair' in value) || // toprfAuthKeyPair is not defined
    typeof value.toprfAuthKeyPair !== 'string' || // toprfAuthKeyPair is not a string
    // revoke token exists but is not a string and is not undefined
    ('revokeToken' in value &&
      typeof value.revokeToken !== 'string' &&
      value.revokeToken !== undefined) ||
    !('accessToken' in value) || // accessToken is not defined
    typeof value.accessToken !== 'string' // accessToken is not a string
  ) {
    throw new Error(SeedlessOnboardingControllerErrorMessage.InvalidVaultData);
  }
}
