import type { LoginResponse } from '../authentication.js';
import { isFreshLoginResponse } from './is-fresh-login-response.js';

/**
 * Creates a minimal JWT string with the given payload claims.
 * The signature is fake — only the payload matters for expiration checks.
 *
 * @param payload - The payload claims to include in the JWT.
 * @returns A JWT string with the given payload claims.
 */
function createTestJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.fake-signature`;
}

function createLoginResponse({
  expiresIn = 3600,
  obtainedAt = Date.now(),
}: {
  expiresIn?: number;
  obtainedAt?: number;
} = {}): LoginResponse {
  return {
    profile: {
      identifierId: '',
      metaMetricsId: '',
      profileId: '',
      canonicalProfileId: '',
    },
    token: {
      accessToken: createTestJwt({ exp: Math.floor(Date.now() / 1000) + 3600 }),
      expiresIn,
      obtainedAt,
    },
  };
}

describe('isFreshLoginResponse()', () => {
  it('returns true for a session younger than 90% of expiresIn', () => {
    const response = createLoginResponse({
      expiresIn: 3600,
      obtainedAt: Date.now() - 3600 * 1000 * 0.89,
    });
    expect(isFreshLoginResponse(response)).toBe(true);
  });

  it('returns false for a session at or past 90% of expiresIn', () => {
    const response = createLoginResponse({
      expiresIn: 3600,
      obtainedAt: Date.now() - 3600 * 1000 * 0.9,
    });
    expect(isFreshLoginResponse(response)).toBe(false);
  });

  it('returns false for input that is not a valid LoginResponse', () => {
    expect(isFreshLoginResponse(null)).toBe(false);
    expect(isFreshLoginResponse({ profile: {} })).toBe(false);
  });
});
