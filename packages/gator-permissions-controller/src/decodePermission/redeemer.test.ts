import type { Hex } from '@metamask/utils';
import { getChecksumAddress } from '@metamask/utils';

import { decodeRedeemerEnforcerTerms } from './redeemer';

describe('decodeRedeemerEnforcerTerms', () => {
  it('decodes a single packed address', () => {
    const raw =
      '1111111111111111111111111111111111111111' as const;
    const terms = `0x${raw}` as Hex;
    expect(decodeRedeemerEnforcerTerms(terms)).toStrictEqual([
      getChecksumAddress(`0x${raw}` as Hex),
    ]);
  });

  it('decodes two concatenated addresses', () => {
    const a = '1111111111111111111111111111111111111111';
    const b = '2222222222222222222222222222222222222222';
    const terms = `0x${a}${b}` as Hex;
    expect(decodeRedeemerEnforcerTerms(terms)).toStrictEqual([
      getChecksumAddress(`0x${a}` as Hex),
      getChecksumAddress(`0x${b}` as Hex),
    ]);
  });

  it('rejects empty payload', () => {
    expect(() => decodeRedeemerEnforcerTerms('0x' as Hex)).toThrow(
      'Invalid redeemer enforcer terms: empty payload',
    );
  });

  it('rejects length not divisible by 20 bytes', () => {
    expect(() =>
      decodeRedeemerEnforcerTerms('0x11' as Hex),
    ).toThrow(
      'Invalid redeemer enforcer terms: length must be a multiple of 20 bytes',
    );
  });
});
