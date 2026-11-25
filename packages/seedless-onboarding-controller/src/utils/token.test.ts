import { describe, expect, it } from 'vitest';

import {
  convertUrlSafeBase64StringToBase64String,
  decodeBase64WithSafeUrlReplacements,
  decodeIdToken,
  padBase64String,
} from './token.js';

describe('token', () => {
  it('pads a base64 string to a multiple of 4', () => {
    const input = btoa('hello').replace(/[=]/gu, '');
    const paddedBase64String = padBase64String(input);

    const base64Length = 4;
    const expectedNumOfPaddings = base64Length - (input.length % base64Length);
    const paddingAssertionRgx = new RegExp(
      `^[A-Za-z0-9+/]+[=]{${expectedNumOfPaddings}}$`,
      'u',
    );
    expect(paddedBase64String).toMatch(paddingAssertionRgx);
  });

  it('does not pad a base64 string that is already a multiple of 4', () => {
    expect(padBase64String('YQ==')).toBe('YQ==');
  });

  it('converts a base64url string to standard base64 without padding', () => {
    expect(convertUrlSafeBase64StringToBase64String('ab-_cQ==')).toBe('ab+/cQ');
  });

  it('decodes a base64url string that contains unicode', () => {
    const utf8String = decodeBase64WithSafeUrlReplacements('SGVsbG8g8J-luQ');

    expect(utf8String).toBe('Hello 🥹');
  });

  it('decodes a JWT idToken payload', () => {
    const jwtToken =
      'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJtZXRhbWFzayIsImlhdCI6MTc1MDY1MTMxMiwiZXhwIjoxNzgyMTg3MzEyLCJhdWQiOiJtZXRhbWFzayIsInN1YiI6InVzZXJAZW1haWwuY29tIiwiZW1haWwiOiJ1c2VyQGVtYWlsLmNvbSJ9.MyYlfGNLmUO92AjAa-Xis7MRVGTh9z1yXMnE___vuLU';

    const parsedResult = JSON.parse(decodeIdToken(jwtToken)) as {
      iss: string;
      aud: string;
      sub: string;
      email: string;
    };

    expect(parsedResult.iss).toBe('metamask');
    expect(parsedResult.aud).toBe('metamask');
    expect(parsedResult.sub).toBe('user@email.com');
    expect(parsedResult.email).toBe('user@email.com');
  });

  it('decodes a base64url payload that contains - and _', () => {
    const payload = {
      exp: 1234567890,
      iat: 1234567800,
      aud: 'test_audience',
      iss: 'test_issuer',
      sub: 'user-1',
      nonce: '~~~?',
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      'base64url',
    );
    expect(encodedPayload).toMatch(/-/u);
    expect(encodedPayload).toMatch(/_/u);

    expect(
      JSON.parse(decodeIdToken(`header.${encodedPayload}.signature`)),
    ).toStrictEqual(payload);
  });

  it('throws when the idToken has no payload segment', () => {
    expect(() => {
      decodeIdToken('not-a-jwt');
    }).toThrow('Invalid JWT token format');
  });
});
