import type { LoginResponse } from '../authentication';

/**
 * Validates that the input is a well-formed, non-expired LoginResponse.
 *
 * Checks structural shape (token + profile objects exist) and verifies
 * the JWT access token's `exp` claim is still in the future. This acts
 * as a hard guard against stale cached tokens regardless of client-side
 * TTL tracking (obtainedAt / expiresIn), which can be corrupted.
 *
 * @param input - unknown/untyped input
 * @returns boolean if input is a valid, non-expired LoginResponse
 */
export function validateLoginResponse(input: unknown): input is LoginResponse {
  const assumedInput = input as LoginResponse;

  if (!assumedInput) {
    return false;
  }

  if (!assumedInput?.token || !assumedInput?.profile) {
    return false;
  }

  if (isJwtExpired(assumedInput.token.accessToken)) {
    return false;
  }

  return true;
}

/**
 * Checks whether a JWT has expired by decoding its `exp` claim.
 *
 * @param token - A JWT string.
 * @returns true if the token is expired or cannot be decoded; false if still valid.
 */
function isJwtExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return true;
    }
    const base64 = parts[1].replace(/-/gu, '+').replace(/_/gu, '/');
    const { exp } = JSON.parse(atob(base64));
    return !Number.isInteger(exp) || exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}
