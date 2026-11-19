import { describe, it, expect } from 'vitest';

import {
  Env,
  MONEY_ACCOUNT_API_URL_MAP,
  MONEY_ACCOUNT_SIWE_CHALLENGE_TTL_MS,
  MONEY_ACCOUNT_SIWE_CLOCK_SKEW_MS,
} from './constants.js';
import type { SiweMessageTemplate } from './siwe-message.js';
import {
  buildSiweMessage,
  getSiweMessageTemplate,
  validateSiweChallengeMessage,
} from './siwe-message.js';

const MOCK_ADDRESS = '0x1111111111111111111111111111111111111111';
const MOCK_OTHER_ADDRESS = '0x2222222222222222222222222222222222222222';
const MOCK_NONCE = 'a'.repeat(64);
const MOCK_NOW = Date.parse('2026-10-22T12:00:00.000Z');

const MOCK_TEMPLATE: SiweMessageTemplate = {
  domain: 'money.dev-api.cx.metamask.io',
  uri: 'https://money.dev-api.cx.metamask.io',
};

// Hand-written copy of the Money Account API's `buildSiweMessage`.
//
// Deliberately independent of the production builder: the golden-string
// assertions below catch a divergence in either implementation.
function createSiweMessage({
  template = MOCK_TEMPLATE,
  address = MOCK_ADDRESS,
  nonce = MOCK_NONCE,
  statement = 'Sign in to view your VBA transfers.',
  version = '1',
  chainId = '143',
  issuedAt = MOCK_NOW,
  expirationTime = issuedAt + MONEY_ACCOUNT_SIWE_CHALLENGE_TTL_MS,
  extraLines = [],
}: {
  template?: SiweMessageTemplate;
  address?: string;
  nonce?: string;
  statement?: string;
  version?: string;
  chainId?: string;
  issuedAt?: number;
  expirationTime?: number;
  extraLines?: string[];
} = {}): string {
  return [
    `${template.domain} wants you to sign in with your Ethereum account:`,
    address,
    '',
    statement,
    '',
    `URI: ${template.uri}`,
    `Version: ${version}`,
    `Chain ID: ${chainId}`,
    `Nonce: ${nonce}`,
    `Issued At: ${new Date(issuedAt).toISOString()}`,
    `Expiration Time: ${new Date(expirationTime).toISOString()}`,
    ...extraLines,
  ].join('\n');
}

function validate(
  message: string,
  {
    nonce = MOCK_NONCE,
    address = MOCK_ADDRESS,
    now = MOCK_NOW,
  }: { nonce?: string; address?: string; now?: number } = {},
): string | null {
  return validateSiweChallengeMessage({
    template: MOCK_TEMPLATE,
    address,
    nonce,
    message,
    now,
  });
}

describe('getSiweMessageTemplate', () => {
  it.each([
    ['dev', Env.DEV, 'money.dev-api.cx.metamask.io'],
    ['uat', Env.UAT, 'money.uat-api.cx.metamask.io'],
    ['prd', Env.PRD, 'money.api.cx.metamask.io'],
  ])('derives the %s origin from the API base URL', (_label, env, domain) => {
    expect(
      getSiweMessageTemplate(MONEY_ACCOUNT_API_URL_MAP[env]),
    ).toStrictEqual({
      domain,
      uri: `https://${domain}`,
    });
  });

  it('ignores any path on the base URL', () => {
    expect(getSiweMessageTemplate('https://money.example/api')).toStrictEqual({
      domain: 'money.example',
      uri: 'https://money.example',
    });
  });
});

describe('buildSiweMessage', () => {
  it('builds the exact Money Account API template', () => {
    expect(
      buildSiweMessage(MOCK_TEMPLATE, MOCK_ADDRESS, MOCK_NONCE, MOCK_NOW),
    ).toBe(
      `money.dev-api.cx.metamask.io wants you to sign in with your Ethereum account:\n` +
        `0x1111111111111111111111111111111111111111\n` +
        `\n` +
        `Sign in to view your VBA transfers.\n` +
        `\n` +
        `URI: https://money.dev-api.cx.metamask.io\n` +
        `Version: 1\n` +
        `Chain ID: 143\n` +
        `Nonce: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n` +
        `Issued At: 2026-10-22T12:00:00.000Z\n` +
        `Expiration Time: 2026-10-22T12:05:00.000Z`,
    );
  });

  it('lowercases the address', () => {
    expect(
      buildSiweMessage(
        MOCK_TEMPLATE,
        MOCK_ADDRESS.toUpperCase().replace('0X', '0x'),
        MOCK_NONCE,
        MOCK_NOW,
      ),
    ).toBe(createSiweMessage());
  });

  it('matches the independent fixture for every environment', () => {
    for (const baseUrl of Object.values(MONEY_ACCOUNT_API_URL_MAP)) {
      const template = getSiweMessageTemplate(baseUrl);

      expect(
        buildSiweMessage(template, MOCK_ADDRESS, MOCK_NONCE, MOCK_NOW),
      ).toBe(createSiweMessage({ template }));
    }
  });
});

describe('validateSiweChallengeMessage', () => {
  it('accepts a message that exactly matches the template', () => {
    expect(validate(createSiweMessage())).toBeNull();
  });

  it.each([
    [
      'a wrong address',
      'message does not match the expected template',
      createSiweMessage({ address: MOCK_OTHER_ADDRESS }),
    ],
    [
      'a wrong domain',
      'message does not match the expected template',
      `evil.example wants you to sign in with your Ethereum account:\n${createSiweMessage()
        .split('\n')
        .slice(1)
        .join('\n')}`,
    ],
    [
      'a wrong URI',
      'message does not match the expected template',
      createSiweMessage({
        template: {
          domain: MOCK_TEMPLATE.domain,
          uri: 'https://evil.example',
        },
      }),
    ],
    [
      'a wrong statement',
      'message does not match the expected template',
      createSiweMessage({ statement: 'Sign in to move your money.' }),
    ],
    [
      'a wrong chain ID',
      'message does not match the expected template',
      createSiweMessage({ chainId: '1' }),
    ],
    [
      'a wrong version',
      'message does not match the expected template',
      createSiweMessage({ version: '2' }),
    ],
    [
      'a message nonce that differs from the challenge nonce',
      'message does not match the expected template',
      createSiweMessage({ nonce: 'b'.repeat(64) }),
    ],
    [
      'an extra trailing line',
      'message does not match the expected template',
      `${createSiweMessage()}\nResources: https://evil.example`,
    ],
    [
      'an extra blank line',
      'message does not match the expected template',
      createSiweMessage().replace('\n\nURI:', '\n\n\nURI:'),
    ],
    [
      'an expiration time shifted by one second',
      'message does not match the expected template',
      createSiweMessage({
        expirationTime: MOCK_NOW + MONEY_ACCOUNT_SIWE_CHALLENGE_TTL_MS + 1000,
      }),
    ],
    [
      'a missing issuedAt line',
      'issuedAt is missing',
      createSiweMessage()
        .split('\n')
        .filter((line) => !line.startsWith('Issued At:'))
        .join('\n'),
    ],
    [
      'a non-ISO issuedAt value',
      'issuedAt is malformed',
      createSiweMessage({ issuedAt: MOCK_NOW }).replace(
        'Issued At: 2026-10-22T12:00:00.000Z',
        'Issued At: not-a-date',
      ),
    ],
    [
      'a non-ZISO issuedAt value',
      'issuedAt is malformed',
      createSiweMessage({ issuedAt: MOCK_NOW }).replace(
        'Issued At: 2026-10-22T12:00:00.000Z',
        'Issued At: October 22, 2026',
      ),
    ],
    [
      'an ISO-shaped but out-of-range issuedAt value',
      'issuedAt is malformed',
      createSiweMessage().replace(
        'Issued At: 2026-10-22T12:00:00.000Z',
        'Issued At: 2026-13-45T99:99:99.999Z',
      ),
    ],
    [
      'an issuedAt far in the future',
      'issuedAt is too far in the future',
      createSiweMessage({ issuedAt: Date.parse('9999-01-01T00:00:00.000Z') }),
    ],
    [
      'an expired challenge',
      'challenge has expired',
      createSiweMessage({
        issuedAt: MOCK_NOW - MONEY_ACCOUNT_SIWE_CHALLENGE_TTL_MS,
      }),
    ],
  ])('rejects %s', (_label, reason, message) => {
    expect(validate(message)).toBe(reason);
  });

  it.each([
    ['a 63-character nonce', 'a'.repeat(63)],
    ['a 65-character nonce', 'a'.repeat(65)],
    ['an uppercase nonce', 'A'.repeat(64)],
    ['a non-hex nonce', 'z'.repeat(64)],
  ])('rejects %s', (_label, nonce) => {
    expect(validate(createSiweMessage({ nonce }), { nonce })).toBe(
      'nonce is not 64 lowercase hex characters',
    );
  });

  it('accepts an issuedAt exactly at the clock-skew limit', () => {
    const issuedAt = MOCK_NOW + MONEY_ACCOUNT_SIWE_CLOCK_SKEW_MS;

    expect(validate(createSiweMessage({ issuedAt }))).toBeNull();
  });

  it('rejects an issuedAt one millisecond beyond the clock-skew limit', () => {
    const issuedAt = MOCK_NOW + MONEY_ACCOUNT_SIWE_CLOCK_SKEW_MS + 1;

    expect(validate(createSiweMessage({ issuedAt }))).toBe(
      'issuedAt is too far in the future',
    );
  });

  it('accepts a challenge one millisecond before expiry', () => {
    const issuedAt = MOCK_NOW - MONEY_ACCOUNT_SIWE_CHALLENGE_TTL_MS + 1;

    expect(validate(createSiweMessage({ issuedAt }))).toBeNull();
  });

  it('rejects a challenge whose expiration time equals now', () => {
    const issuedAt = MOCK_NOW - MONEY_ACCOUNT_SIWE_CHALLENGE_TTL_MS;

    expect(validate(createSiweMessage({ issuedAt }))).toBe(
      'challenge has expired',
    );
  });

  it('checks the requested address, not only the signed one', () => {
    expect(validate(createSiweMessage(), { address: MOCK_OTHER_ADDRESS })).toBe(
      'message does not match the expected template',
    );
  });
});
