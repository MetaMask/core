import { is, size, string } from 'superstruct';

import type { Base64Options } from './base64';
import { base64 } from './base64';

describe('base64', () => {
  it.each([
    ['abcd', undefined],
    ['abcd', { paddingRequired: true }],
    ['ab', undefined],
    ['ab==', undefined],
    ['ab==', { paddingRequired: true }],
    ['abc', undefined],
    ['abc=', undefined],
    ['abc=', { paddingRequired: true }],
    [
      'abcdefghijklmnopqrstuvwxyzABCDEFGHJIKLMNOPQRSTUVXYZ01234567890+/',
      undefined,
    ],
    [
      'abcdefghijklmnopqrstuvwxyzABCDEFGHJIKLMNOPQRSTUVXYZ01234567890-_',
      { characterSet: 'base64url' },
    ] as const,
  ] as [string, Base64Options | undefined][])(
    'validates valid base64',
    (value, opts) => {
      const struct = base64(string(), opts);
      expect(is(value, struct)).toBe(true);
    },
  );

  it.each([
    ['ab', { paddingRequired: true }],
    ['abc', { paddingRequired: true }],
    ['a', undefined],
    ['aaaaa', undefined],
    [String.raw`\\\\`, undefined],
    ['ab=', undefined],
    ['ab=', { paddingRequired: true }],
    ['abc==', undefined],
    ['abc==', { paddingRequired: true }],
    [',.', undefined],
    [',.', { characterSet: 'base64url' }] as const,
    [
      'abcdefghijklmnopqrstuvwxyzABCDEFGHJIKLMNOPQRSTUVXYZ01234567890-_',
      undefined,
    ],
    [
      'abcdefghijklmnopqrstuvwxyzABCDEFGHJIKLMNOPQRSTUVXYZ01234567890+/',
      { characterSet: 'base64url' },
    ],
  ] as [string, Base64Options | undefined][])(
    "doesn't validate invalid base64",
    (value, opts) => {
      const struct = base64(string(), opts);
      expect(is(value, struct)).toBe(false);
    },
  );

  it('respects string() constraints', () => {
    const struct = base64(size(string(), 4, 4));
    expect(is('abcd', struct)).toBe(true);
    expect(is('abcdabcd', struct)).toBe(false);
  });
});
