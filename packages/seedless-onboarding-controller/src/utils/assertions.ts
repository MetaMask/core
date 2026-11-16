import { SeedlessOnboardingControllerErrorMessage } from '../constants.js';
import { SeedlessOnboardingError } from '../errors.js';
import type { AuthenticatedUserDetails, VaultData } from '../types.js';
import { decodeJWTToken } from './utils.js';

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
 * Assert that the provided encrypted keyring encryption key is a valid
 * non-empty string.
 *
 * @param encryptedKeyringEncryptionKey - The encrypted keyring encryption key.
 * @throws If the encrypted keyring encryption key is not a valid string.
 */
export function assertIsEncryptedKeyringEncryptionKeySet(
  encryptedKeyringEncryptionKey: string | undefined,
): asserts encryptedKeyringEncryptionKey is string {
  if (!encryptedKeyringEncryptionKey) {
    throw new Error(
      SeedlessOnboardingControllerErrorMessage.EncryptedKeyringEncryptionKeyNotSet,
    );
  }
}

/**
 * Assert that the provided encrypted seedless encryption key is a valid
 * non-empty string.
 *
 * @param encryptedSeedlessEncryptionKey - The encrypted seedless encryption key.
 * @throws If the encrypted seedless encryption key is not a valid string.
 */
export function assertIsEncryptedSeedlessEncryptionKeySet(
  encryptedSeedlessEncryptionKey: string | undefined,
): asserts encryptedSeedlessEncryptionKey is string {
  if (!encryptedSeedlessEncryptionKey) {
    throw new Error(
      SeedlessOnboardingControllerErrorMessage.EncryptedSeedlessEncryptionKeyNotSet,
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
    typeof value.toprfAuthKeyPair !== 'string' // toprfAuthKeyPair is not a string
  ) {
    throw new Error(SeedlessOnboardingControllerErrorMessage.InvalidVaultData);
  }

  if (!('revokeToken' in value) || typeof value.revokeToken !== 'string') {
    throw new Error(
      SeedlessOnboardingControllerErrorMessage.InvalidRevokeToken,
    );
  }

  if (!('accessToken' in value) || typeof value.accessToken !== 'string') {
    throw new Error(
      SeedlessOnboardingControllerErrorMessage.InvalidAccessToken,
    );
  }
}

/**
 * Assert that the first idToken's `sub` claim matches the userId being sent to
 * the TOPRF nodes. The nodes reject mismatched pairs server-side, but failing
 * locally first avoids a wasted network round-trip and surfaces a
 * distinguishable error instead of a generic authentication failure.
 *
 * Lenient by design: if the token cannot be decoded or has no `sub` claim,
 * validation is deferred to the server side so that flows are not broken.
 *
 * @param idTokens - The id tokens to check. Only the first token is validated.
 * @param userId - The user id the token should belong to.
 * @throws If the idToken's `sub` claim does not match the provided userId.
 */
export function assertIdTokenMatchesUserId(
  idTokens: string[],
  userId: string,
): void {
  let decodedSub: string | undefined;
  try {
    decodedSub = decodeJWTToken(idTokens[0]).sub;
  } catch {
    // Undecodable token: defer to server-side validation.
    return;
  }

  if (decodedSub !== undefined && decodedSub !== userId) {
    throw new SeedlessOnboardingError(
      SeedlessOnboardingControllerErrorMessage.IdentityMismatch,
      {
        details: 'The idToken `sub` claim does not match the provided userId.',
      },
    );
  }
}

/**
 * Assert that the controller identity has not changed between two points in
 * time. Used to guard against writing a stale authentication result into
 * state after the identity was switched (by another `authenticate()` call) or
 * wiped (by `clearState()`) while an asynchronous request was in flight.
 *
 * Callers should invoke this immediately before the state write, with no
 * `await` in between, so that the check and the write are atomic under the
 * JavaScript event loop.
 *
 * @param currentState - The identity fields from the current controller state.
 * @param expectedIdentity - The identity fields captured before the request.
 * @throws If any identity field differs from the expected value.
 */
export function assertIdentityUnchanged(
  currentState: {
    userId?: string;
    authConnectionId?: string;
  },
  expectedIdentity: {
    userId?: string;
    authConnectionId?: string;
  },
): void {
  if (
    currentState.userId !== expectedIdentity.userId ||
    currentState.authConnectionId !== expectedIdentity.authConnectionId
  ) {
    throw new SeedlessOnboardingError(
      SeedlessOnboardingControllerErrorMessage.IdentityMismatch,
      {
        details: 'Controller identity changed while the request was in flight.',
      },
    );
  }
}
