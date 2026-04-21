import type { LoginResponse } from '../authentication';
import { validateLoginResponse } from './validate-login-response';

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

function createValidLoginResponse(
  accessToken: string = createTestJwt({
    exp: Math.floor(Date.now() / 1000) + 3600,
  }),
): LoginResponse {
  return {
    profile: { identifierId: '', metaMetricsId: '', profileId: '' },
    token: { accessToken, expiresIn: 3600, obtainedAt: Date.now() },
  };
}

describe('validateLoginResponse()', () => {
  it('returns true for a valid, non-expired LoginResponse', () => {
    expect(validateLoginResponse(createValidLoginResponse())).toBe(true);
  });

  it('returns false for null/undefined/empty input', () => {
    expect(validateLoginResponse(null)).toBe(false);
    expect(validateLoginResponse(undefined)).toBe(false);
    expect(validateLoginResponse({})).toBe(false);
  });

  it('returns false when token or profile is missing', () => {
    expect(validateLoginResponse({ profile: {} })).toBe(false);
    expect(validateLoginResponse({ token: {} })).toBe(false);
  });

  it('returns false when the JWT exp claim is in the past', () => {
    const expiredJwt = createTestJwt({
      exp: Math.floor(Date.now() / 1000) - 3600,
    });
    expect(validateLoginResponse(createValidLoginResponse(expiredJwt))).toBe(
      false,
    );
  });

  it('returns false when the JWT has no exp claim', () => {
    const noExpJwt = createTestJwt({ sub: 'user-123' });
    expect(validateLoginResponse(createValidLoginResponse(noExpJwt))).toBe(
      false,
    );
  });

  it('returns false when the JWT exp claim is not a number', () => {
    const badExpJwt = createTestJwt({ exp: 'not-a-number' });
    expect(validateLoginResponse(createValidLoginResponse(badExpJwt))).toBe(
      false,
    );
  });

  it('returns false when the JWT exp claim is a float', () => {
    const floatExpJwt = createTestJwt({
      exp: Math.floor(Date.now() / 1000) + 3600.5,
    });
    expect(validateLoginResponse(createValidLoginResponse(floatExpJwt))).toBe(
      false,
    );
  });

  it('returns false when the access token is malformed', () => {
    expect(validateLoginResponse(createValidLoginResponse('not-a-jwt'))).toBe(
      false,
    );
    expect(validateLoginResponse(createValidLoginResponse(''))).toBe(false);
    expect(validateLoginResponse(createValidLoginResponse('a.b'))).toBe(false);
  });

  it('returns false when the JWT payload has invalid base64', () => {
    expect(
      validateLoginResponse(
        createValidLoginResponse('header.!!!invalid!!!.sig'),
      ),
    ).toBe(false);
  });
});
