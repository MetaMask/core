import type { Hex } from '@metamask/utils';

import { encodeCaveatTerms } from './encode-caveat-terms';

describe('encodeCaveatTerms', () => {
  it('returns just "0x" when called with no values', () => {
    expect(encodeCaveatTerms()).toBe('0x');
  });

  it('left-pads a single value to 32 bytes (64 hex chars)', () => {
    const result = encodeCaveatTerms('0xff' as Hex);

    expect(result).toBe(
      '0x00000000000000000000000000000000000000000000000000000000000000ff',
    );
  });

  it('left-pads an address to 32 bytes', () => {
    const address = '0x1111111111111111111111111111111111111111' as Hex;

    expect(encodeCaveatTerms(address)).toBe(
      '0x0000000000000000000000001111111111111111111111111111111111111111',
    );
  });

  it('concatenates multiple values, each padded to 32 bytes', () => {
    const a = '0xaa' as Hex;
    const b = '0xbb' as Hex;

    expect(encodeCaveatTerms(a, b)).toBe(
      `0x${'aa'.padStart(64, '0')}${'bb'.padStart(64, '0')}`,
    );
  });

  it('leaves a value that is already 32 bytes unchanged', () => {
    const value =
      '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' as Hex;

    expect(encodeCaveatTerms(value)).toBe(value);
  });
});
