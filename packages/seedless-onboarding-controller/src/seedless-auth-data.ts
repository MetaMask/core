import { AuthConnection } from './constants.js';
import type { SeedlessAuthData } from './types.js';

const AUTH_CONNECTION_VALUES: ReadonlySet<string> = new Set(
  Object.values(AuthConnection),
);

/**
 * Checks provider-returned auth data against the fields of
 * {@link SeedlessAuthData} and copies only those fields. Unknown fields, such
 * as `skipLock`, are dropped.
 *
 * @param data - Value returned by an identifier login.
 * @returns The documented fields, or `undefined` when the value is incomplete.
 */
export function parseSeedlessAuthData(
  data: unknown,
): SeedlessAuthData | undefined {
  if (typeof data !== 'object' || data === null) {
    return undefined;
  }
  const value = data as Record<string, unknown>;
  if (
    !isNonEmptyStringArray(value.idTokens) ||
    !isNonEmptyString(value.accessToken) ||
    !isNonEmptyString(value.metadataAccessToken) ||
    !isNonEmptyString(value.refreshToken) ||
    !isNonEmptyString(value.authConnectionId) ||
    !isNonEmptyString(value.userId) ||
    !isAuthConnection(value.authConnection) ||
    !isOptionalNonEmptyString(value.revokeToken) ||
    !isOptionalString(value.groupedAuthConnectionId) ||
    !isOptionalString(value.socialLoginEmail)
  ) {
    return undefined;
  }
  return {
    idTokens: [...value.idTokens],
    accessToken: value.accessToken,
    metadataAccessToken: value.metadataAccessToken,
    refreshToken: value.refreshToken,
    authConnection: value.authConnection,
    authConnectionId: value.authConnectionId,
    userId: value.userId,
    ...(value.revokeToken === undefined
      ? {}
      : { revokeToken: value.revokeToken }),
    ...(value.groupedAuthConnectionId === undefined
      ? {}
      : { groupedAuthConnectionId: value.groupedAuthConnectionId }),
    ...(value.socialLoginEmail === undefined
      ? {}
      : { socialLoginEmail: value.socialLoginEmail }),
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString)
  );
}

function isAuthConnection(value: unknown): value is AuthConnection {
  return typeof value === 'string' && AUTH_CONNECTION_VALUES.has(value);
}

/**
 * `undefined` is allowed. A present value must be a non-empty string, matching
 * an optional token field.
 *
 * @param value - Field value.
 * @returns Whether the field is absent or a non-empty string.
 */
function isOptionalNonEmptyString(value: unknown): value is string | undefined {
  return value === undefined || isNonEmptyString(value);
}

/**
 * `undefined` is allowed. A present value must be a string, including empty.
 *
 * @param value - Field value.
 * @returns Whether the field is absent or a string.
 */
function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}
