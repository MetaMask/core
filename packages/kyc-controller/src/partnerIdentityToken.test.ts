import { describe, expect, it } from 'vitest';

import { toBase64Url } from './encoding.js';
import {
  getEmailFromPartnerIdentityToken,
  isEmailRequiredError,
} from './partnerIdentityToken.js';

/**
 * Builds an unsigned JWT whose payload is the given JSON object.
 *
 * @param payload - Claims to encode in the JWT payload.
 * @returns A three-segment JWT string.
 */
function unsignedJwt(payload: unknown): string {
  const encode = (value: unknown): string =>
    toBase64Url(new TextEncoder().encode(JSON.stringify(value)));
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.sig`;
}

describe('getEmailFromPartnerIdentityToken', () => {
  it('returns the email from JWT ext when email_verified is true', () => {
    expect(
      getEmailFromPartnerIdentityToken(
        unsignedJwt({
          ext: { email: 'user@example.com', email_verified: true },
        }),
      ),
    ).toBe('user@example.com');
  });

  it('throws when the token is not a JWT', () => {
    expect(() => getEmailFromPartnerIdentityToken('not-a-jwt')).toThrow(
      /not a well-formed JWT/u,
    );
  });

  it('throws when the payload is not an object', () => {
    expect(() =>
      getEmailFromPartnerIdentityToken(unsignedJwt('not-an-object')),
    ).toThrow(/payload is not an object/u);
  });

  it('throws when ext is not an object', () => {
    expect(() =>
      getEmailFromPartnerIdentityToken(unsignedJwt({ ext: null })),
    ).toThrow(/has no ext object/u);
  });

  it('throws when the payload is not JSON', () => {
    const payload = toBase64Url(new TextEncoder().encode('not-json'));
    expect(() =>
      getEmailFromPartnerIdentityToken(`header.${payload}.sig`),
    ).toThrow(/failed to decode partner identity token payload/u);
  });

  it('throws when the token payload has no email claim', () => {
    expect(() =>
      getEmailFromPartnerIdentityToken(
        unsignedJwt({ ext: { email_verified: true } }),
      ),
    ).toThrow(/does not contain an email claim/u);
  });

  it('throws when email_verified is not true', () => {
    expect(() =>
      getEmailFromPartnerIdentityToken(
        unsignedJwt({
          ext: { email: 'user@example.com', email_verified: false },
        }),
      ),
    ).toThrow(/email is not verified/u);
    expect(() =>
      getEmailFromPartnerIdentityToken(
        unsignedJwt({ ext: { email: 'user@example.com' } }),
      ),
    ).toThrow(/email is not verified/u);
  });
});

describe('isEmailRequiredError', () => {
  it('returns true for an error with status 422', () => {
    expect(
      isEmailRequiredError(
        Object.assign(new Error('email_required'), { status: 422 }),
      ),
    ).toBe(true);
  });

  it('returns false for an error without status 422', () => {
    expect(isEmailRequiredError(new Error('token mint failed'))).toBe(false);
  });

  it('returns false for a non-object thrown value', () => {
    expect(isEmailRequiredError('email_required')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isEmailRequiredError(null)).toBe(false);
  });
});
