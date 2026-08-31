import {
  decodeJwtPayload,
  getMoneyAccountPlusClaimFromBearerToken,
} from './jwt-claims.js';
import { Env, getProductEntitlementsClaimKey } from './types.js';

function createBearerTokenFromRawPayload(rawPayload: string): string {
  return [
    Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString(
      'base64url',
    ),
    Buffer.from(rawPayload).toString('base64url'),
    'signature',
  ].join('.');
}

function createBearerToken(payload: unknown): string {
  return createBearerTokenFromRawPayload(JSON.stringify(payload));
}

describe('jwt claims helpers', () => {
  const claimKey = getProductEntitlementsClaimKey(Env.PRD);

  it('decodes a valid JWT payload', () => {
    const payload = { foo: 'bar', answer: 42 };
    const token = createBearerToken(payload);

    expect(decodeJwtPayload(token)).toStrictEqual(payload);
  });

  it('decodes a payload that uses the base64url alphabet', () => {
    const payload = { path: 'a/b+c', note: '>>>' };
    const token = createBearerToken(payload);

    expect(decodeJwtPayload(token)).toStrictEqual(payload);
  });

  it.each([
    '',
    'not-a-jwt',
    'header.payload',
    'header.a.signature',
    'header.***.signature',
    'header.invalid-base64.signature',
    createBearerToken('not-an-object'),
    createBearerTokenFromRawPayload('{'),
  ])('returns null for a malformed JWT payload: %p', (token) => {
    expect(decodeJwtPayload(token)).toBeNull();
  });

  it('extracts the money account plus claim from the namespaced product entitlements claim', () => {
    const claim = {
      plan: 'premium',
      entitlements: {
        swapFeeWaiver: true,
        perpsFeeWaiver: false,
        predictFreeTx: true,
        premiumApy: false,
      },
    };

    const token = createBearerToken({
      [claimKey]: {
        moneyAccountPlus: claim,
      },
    });

    expect(getMoneyAccountPlusClaimFromBearerToken(token, claimKey)).toStrictEqual(
      claim,
    );
  });

  it.each([
    '',
    'not-a-jwt',
    'header.payload',
    'header.a.signature',
    'header.***.signature',
    'header.invalid-base64.signature',
    createBearerToken('not-an-object'),
    createBearerToken({}),
    createBearerToken({ [claimKey]: null }),
    createBearerToken({ [claimKey]: 'invalid' }),
    createBearerToken({ [claimKey]: {} }),
    createBearerToken({ [claimKey]: { moneyAccountPlus: null } }),
    createBearerToken({
      [claimKey]: {
        moneyAccountPlus: {
          plan: 'premium',
          entitlements: null,
        },
      },
    }),
    createBearerToken({
      [claimKey]: {
        moneyAccountPlus: {
          entitlements: {
            swapFeeWaiver: true,
            perpsFeeWaiver: false,
            predictFreeTx: true,
            premiumApy: false,
          },
        },
      },
    }),
    createBearerToken({
      [claimKey]: {
        moneyAccountPlus: {
          plan: 'premium',
          entitlements: {
            swapFeeWaiver: true,
            perpsFeeWaiver: 'nope',
            predictFreeTx: true,
            premiumApy: false,
          },
        },
      },
    }),
  ])('fails closed for malformed or unsupported claim payloads: %p', (token) => {
    expect(getMoneyAccountPlusClaimFromBearerToken(token, claimKey)).toBeNull();
  });
});
