import type {
  AnalyticsContext,
  AnalyticsTrackingEvent,
} from '@metamask/analytics-controller';

import {
  SeedlessIdentityMismatchReason,
  SeedlessOnboardingControllerErrorMessage,
} from '../constants.js';
import type { SeedlessIdentityMismatchSource } from '../constants.js';
import { SeedlessOnboardingError } from '../errors.js';
import type { AuthenticatedUserDetails, VaultData } from '../types.js';
import { trackIdentityMismatchEvent } from './analytics.js';
import { decodeIdToken } from './token.js';

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
 * Claims the OAuth clients use to derive the user id sent to the nodes.
 *
 * Extension `OAuthService` uses `userInfo.sub || userInfo.email`. Google and
 * Apple set `sub` from the `sub` claim. Telegram sets it from
 * `sub ?? user_id`. Mobile uses `sub` directly.
 */
type IdTokenIdentityClaims = {
  sub?: string;
  email?: string;
  /**
   * Telegram user id, used when `sub` is null or undefined.
   */
  // eslint-disable-next-line @typescript-eslint/naming-convention -- JWT claim name
  user_id?: string;
};

/**
 * Derive the user id an OAuth client sends alongside this idToken.
 *
 * Matches Extension `OAuthService.#getAuthIdToken`: the login handler's
 * subject (`sub`, or Telegram `sub ?? user_id`), then `email`.
 *
 * @param token - The id token to read.
 * @returns The derived user id, or an empty string when none of the claims
 * are present.
 */
function getUserIdFromIdToken(token: string): string {
  const payload = JSON.parse(decodeIdToken(token)) as IdTokenIdentityClaims;
  // Empty string is missing, matching `userInfo.sub || userInfo.email`.
  const subject = payload.sub ?? payload.user_id ?? '';
  if (subject) {
    return subject;
  }
  return payload.email ?? '';
}

/**
 * Read the user id from an id token without throwing.
 *
 * @param token - The id token to read, when one was provided.
 * @returns The derived user id, or `undefined` when it cannot be read.
 */
function getComparableTokenUserId(
  token: string | undefined,
): string | undefined {
  if (!token) {
    return undefined;
  }

  try {
    return getUserIdFromIdToken(token) || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Assert that the first idToken belongs to the userId being sent to the TOPRF
 * nodes. The nodes reject mismatched pairs server-side, but failing locally
 * first avoids a wasted network round-trip and surfaces a distinguishable
 * error instead of a generic authentication failure.
 *
 * The token user id is derived the same way clients derive it: `sub`, then
 * Telegram `user_id` when `sub` is nullish, then `email`. A missing token, a
 * token that cannot be decoded, a token with none of those claims, or a
 * null/undefined userId is a hard failure.
 *
 * @param idTokens - The id tokens to check. Only the first token is validated.
 * @param userId - The user id the token should belong to.
 * @throws If the user ID is null or undefined, if the idToken is missing,
 * cannot be decoded, has no derived user id, or that user id does not match
 * the provided userId.
 */
export function assertIdTokenMatchesUserId(
  idTokens: string[],
  userId: string | null | undefined,
): asserts userId is string {
  if (userId === null || userId === undefined) {
    throw new SeedlessOnboardingError(
      SeedlessOnboardingControllerErrorMessage.IdentityMismatch,
      {
        details: SeedlessIdentityMismatchReason.MissingUserId,
      },
    );
  }

  const token = idTokens[0];
  if (!token) {
    throw new SeedlessOnboardingError(
      SeedlessOnboardingControllerErrorMessage.IdentityMismatch,
      {
        details: SeedlessIdentityMismatchReason.MissingIdToken,
      },
    );
  }

  let tokenUserId: string;
  try {
    tokenUserId = getUserIdFromIdToken(token);
  } catch (error) {
    throw new SeedlessOnboardingError(
      SeedlessOnboardingControllerErrorMessage.IdentityMismatch,
      {
        details: SeedlessIdentityMismatchReason.IdTokenUndecodable,
        cause: error,
      },
    );
  }

  if (!tokenUserId || tokenUserId !== userId) {
    throw new SeedlessOnboardingError(
      SeedlessOnboardingControllerErrorMessage.IdentityMismatch,
      {
        details: SeedlessIdentityMismatchReason.UserIdMismatch,
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
        details: SeedlessIdentityMismatchReason.IdentityChangedInFlight,
      },
    );
  }
}

type TrackEvent = (
  event: AnalyticsTrackingEvent,
  context?: AnalyticsContext,
) => void | Promise<void>;

/**
 * Assert the first id token belongs to `userId`, and report a mismatch.
 * The original error is rethrown. A tracking failure does not replace it.
 *
 * @param idTokens - Id tokens to check. Only the first is validated.
 * @param userId - The user id the token should belong to.
 * @param source - The flow that is checking the token.
 * @param trackEvent - Emits a non-sensitive analytics event.
 * @param migrationVersion - Controller migration version from state.
 */
export function assertIdTokenMismatchAndTrackEvent(
  idTokens: string[],
  userId: string | null | undefined,
  source: SeedlessIdentityMismatchSource,
  trackEvent: TrackEvent,
  migrationVersion = 0,
): asserts userId is string {
  try {
    assertIdTokenMatchesUserId(idTokens, userId);
  } catch (error) {
    trackIdentityMismatchEvent({
      source,
      error,
      trackEvent,
      expectedUserId: userId,
      actualUserId: getComparableTokenUserId(idTokens[0]),
      migrationVersion,
    });
    throw error;
  }
}

/**
 * Assert the controller identity is unchanged, and report a mismatch.
 * The original error is rethrown. A tracking failure does not replace it.
 *
 * @param params - The identities being compared and the analytics callbacks.
 * @param params.currentState - Identity fields from the current controller state.
 * @param params.expectedIdentity - Identity fields captured before the request.
 * @param params.source - The flow that is checking the identity.
 * @param params.trackEvent - Emits a non-sensitive analytics event.
 * @param params.migrationVersion - Controller migration version from state.
 */
export function assertIdentityUnchangedAndTrackEvent({
  currentState,
  expectedIdentity,
  source,
  trackEvent,
  migrationVersion = 0,
}: {
  currentState: {
    userId?: string;
    authConnectionId?: string;
  };
  expectedIdentity: {
    userId?: string;
    authConnectionId?: string;
  };
  source: SeedlessIdentityMismatchSource;
  trackEvent: TrackEvent;
  migrationVersion?: number;
}): void {
  try {
    assertIdentityUnchanged(currentState, expectedIdentity);
  } catch (error) {
    trackIdentityMismatchEvent({
      source,
      error,
      trackEvent,
      expectedUserId: expectedIdentity.userId,
      actualUserId: currentState.userId,
      migrationVersion,
    });
    throw error;
  }
}
