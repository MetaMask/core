import { SeedlessOnboardingControllerErrorMessage } from './constants';
import type { AuthenticatedUserDetails, TokenMintResult, VaultData } from './types';
import { hasProperty } from '@metamask/utils';

export function assertIsValidTokenMintResult(value: unknown): asserts value is TokenMintResult {
  if (!value || typeof value !== 'object') {
    throw new Error(SeedlessOnboardingControllerErrorMessage.InvalidTokenMintResult);
  }

  if (!hasProperty(value, 'idTokens') || !Array.isArray(value.idTokens)) {
    throw new Error(SeedlessOnboardingControllerErrorMessage.InvalidTokenMintResult);
  }

  if (!hasProperty(value, 'accessToken') || typeof value.accessToken !== 'string') {
    throw new Error(SeedlessOnboardingControllerErrorMessage.InvalidTokenMintResult);
  }
  
  if (!hasProperty(value, 'metadataAccessToken') || typeof value.metadataAccessToken !== 'string') {
    throw new Error(SeedlessOnboardingControllerErrorMessage.InvalidTokenMintResult);
  }

  if (!hasProperty(value, 'revokeToken') || typeof value.revokeToken !== 'string') {
    throw new Error(SeedlessOnboardingControllerErrorMessage.InvalidTokenMintResult);
  }
  
  if (!hasProperty(value, 'refreshToken') || typeof value.refreshToken !== 'string') {
    throw new Error(SeedlessOnboardingControllerErrorMessage.InvalidTokenMintResult);
  }
}

/**
 * Assert that the provided password is a valid non-empty string.
 *
 * @param password - The password to check.
 * @throws If the password is not a valid string.
 */
export function assertIsValidPassword(
  password: unknown,
): asserts password is string {
  if (typeof password !== 'string') {
    throw new Error(SeedlessOnboardingControllerErrorMessage.WrongPasswordType);
  }

  if (!password?.length) {
    throw new Error(
      SeedlessOnboardingControllerErrorMessage.InvalidEmptyPassword,
    );
  }
}

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
    !hasProperty(value, 'authConnectionId') ||
    typeof value.authConnectionId !== 'string' ||
    !hasProperty(value, 'userId') ||
    typeof value.userId !== 'string'
  ) {
    throw new Error(
      SeedlessOnboardingControllerErrorMessage.MissingAuthUserInfo,
    );
  }

  if (
    !hasProperty(value, 'nodeAuthTokens') ||
    typeof value.nodeAuthTokens !== 'object' ||
    !Array.isArray(value.nodeAuthTokens) ||
    value.nodeAuthTokens.length < 3 // At least 3 auth tokens are required for Threshold OPRF service
  ) {
    throw new Error(
      SeedlessOnboardingControllerErrorMessage.InsufficientAuthToken,
    );
  }

  if (
    !hasProperty(value, 'refreshToken') ||
    typeof value.refreshToken !== 'string'
  ) {
    throw new Error(
      SeedlessOnboardingControllerErrorMessage.InvalidRefreshToken,
    );
  }
  if (
    !hasProperty(value, 'metadataAccessToken') ||
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
    !hasProperty(value, 'toprfEncryptionKey') || // toprfEncryptionKey is not defined
    typeof value.toprfEncryptionKey !== 'string' || // toprfEncryptionKey is not a string
    !hasProperty(value, 'toprfPwEncryptionKey') || // toprfPwEncryptionKey is not defined
    typeof value.toprfPwEncryptionKey !== 'string' || // toprfPwEncryptionKey is not a string
    !hasProperty(value, 'toprfAuthKeyPair') || // toprfAuthKeyPair is not defined
    typeof value.toprfAuthKeyPair !== 'string' // toprfAuthKeyPair is not a string
  ) {
    throw new Error(SeedlessOnboardingControllerErrorMessage.InvalidVaultData);
  }

  if (!hasProperty(value, 'revokeToken') || typeof value.revokeToken !== 'string') {
    throw new Error(
      SeedlessOnboardingControllerErrorMessage.InvalidRevokeToken,
    );
  }

  if (!hasProperty(value, 'accessToken') || typeof value.accessToken !== 'string') {
    throw new Error(
      SeedlessOnboardingControllerErrorMessage.InvalidAccessToken,
    );
  }

  // if profilePairingToken is provided, it must be a string
  if (hasProperty(value, 'profilePairingToken') && typeof value.profilePairingToken !== 'string') {
    throw new Error(
      SeedlessOnboardingControllerErrorMessage.InvalidProfilePairingToken,
    );
  }
}
