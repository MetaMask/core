import { toBase64Url } from './encoding.js';
import {
  getEmailFromPartnerIdentityToken,
  isUnprocessableEntity,
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
  it('returns the email from JWT ext', () => {
    expect(
      getEmailFromPartnerIdentityToken(
        unsignedJwt({ ext: { email: 'user@example.com' } }),
      ),
    ).toBe('user@example.com');
  });

  it('throws when the token is not a JWT', () => {
    expect(() => getEmailFromPartnerIdentityToken('not-a-jwt')).toThrow(
      /not a well-formed JWT/u,
    );
  });

  it('throws when the payload is not JSON', () => {
    const payload = toBase64Url(new TextEncoder().encode('not-json'));
    expect(() =>
      getEmailFromPartnerIdentityToken(`header.${payload}.sig`),
    ).toThrow(/failed to decode partner identity token payload/u);
  });

  it('throws when the token payload has no email claim', () => {
    expect(() =>
      getEmailFromPartnerIdentityToken(unsignedJwt({ ext: {} })),
    ).toThrow(/does not contain an email claim/u);
  });
});

describe('isUnprocessableEntity', () => {
  it('returns true for an error with status 422', () => {
    expect(
      isUnprocessableEntity(
        Object.assign(new Error('email_required'), { status: 422 }),
      ),
    ).toBe(true);
  });

  it('returns false for an error without status 422', () => {
    expect(isUnprocessableEntity(new Error('token mint failed'))).toBe(false);
  });

  it('returns false for a non-object thrown value', () => {
    expect(isUnprocessableEntity('email_required')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isUnprocessableEntity(null)).toBe(false);
  });
});
