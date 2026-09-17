import type { LoginResponse } from '../authentication.js';
import { validateLoginResponse } from './validate-login-response.js';

/**
 * Fraction of `expiresIn` after which a session is refreshed rather than
 * reused, so a token is never presented right at its expiry.
 */
const REFRESH_THRESHOLD = 0.9;

/**
 * Checks whether a stored LoginResponse can still be used as is.
 *
 * Builds on `validateLoginResponse` and additionally requires the session to
 * be younger than 90% of `expiresIn` (seconds), which is the point where the
 * auth flows log in again instead of reusing it.
 *
 * @param input - unknown/untyped input
 * @returns boolean if input is a valid LoginResponse that needs no refresh
 */
export function isFreshLoginResponse(input: unknown): input is LoginResponse {
  if (!validateLoginResponse(input)) {
    return false;
  }

  const sessionAge = Date.now() - input.token.obtainedAt;
  return sessionAge < input.token.expiresIn * 1000 * REFRESH_THRESHOLD;
}
