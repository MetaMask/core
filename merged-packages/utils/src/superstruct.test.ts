import { assert, is, pattern, string } from '@metamask/superstruct';

import { definePattern } from './superstruct';

describe('definePattern', () => {
  const hexPattern = /^0x[0-9a-f]+$/u;
  const HexStringPattern = pattern(string(), hexPattern);
  const HexString = definePattern('HexString', hexPattern);

  it('is similar to superstruct.pattern', () => {
    expect(is('0xdeadbeef', HexStringPattern)).toBe(true);
    expect(is('0xdeadbeef', HexString)).toBe(true);
    expect(is('foobar', HexStringPattern)).toBe(false);
    expect(is('foobar', HexString)).toBe(false);
  });

  it('throws and error if assert fails', () => {
    const value = 'foobar';
    expect(() => assert(value, HexString)).toThrow(
      `Expected a value of type \`HexString\`, but received: \`"foobar"\``,
    );
  });
});
