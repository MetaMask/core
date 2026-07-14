import { findSimilarAddresses } from './address-poisoning';

function getNumberRange(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

describe('findSimilarAddresses', () => {
  const CLASSIC_CANDIDATE = '0x1234aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa5678';
  const CLASSIC_KNOWN = '0x1234bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb5678';

  it('returns no matches when there are no known addresses', () => {
    expect(findSimilarAddresses(CLASSIC_CANDIDATE, [])).toStrictEqual([]);
  });

  it('returns a classic poisoning match with prefix, suffix, score, and diff indices', () => {
    expect(
      findSimilarAddresses(CLASSIC_CANDIDATE, [CLASSIC_KNOWN]),
    ).toStrictEqual([
      {
        knownAddress: CLASSIC_KNOWN,
        prefixMatchLength: 4,
        suffixMatchLength: 4,
        poisoningScore: 8,
        diffIndices: getNumberRange(6, 37),
      },
    ]);
  });

  it('excludes exact matches', () => {
    expect(
      findSimilarAddresses('0x1234567890abcdef1234567890abcdef12345678', [
        '0x1234567890abcdef1234567890abcdef12345678',
      ]),
    ).toStrictEqual([]);
  });

  it('matches case-insensitively', () => {
    expect(
      findSimilarAddresses('0x1234AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA5678', [
        CLASSIC_KNOWN,
      ]),
    ).toStrictEqual([
      {
        knownAddress: CLASSIC_KNOWN,
        prefixMatchLength: 4,
        suffixMatchLength: 4,
        poisoningScore: 8,
        diffIndices: getNumberRange(6, 37),
      },
    ]);
  });

  it('skips partial matches below the default threshold', () => {
    expect(
      findSimilarAddresses('0x123aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa567', [
        '0x123bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb567',
      ]),
    ).toStrictEqual([]);
  });

  it('supports custom thresholds', () => {
    expect(
      findSimilarAddresses(
        '0x123aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa567',
        ['0x123bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb567'],
        {
          prefixLen: 3,
          suffixLen: 3,
        },
      ),
    ).toStrictEqual([
      {
        knownAddress: '0x123bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb567',
        prefixMatchLength: 3,
        suffixMatchLength: 3,
        poisoningScore: 6,
        diffIndices: getNumberRange(5, 38),
      },
    ]);
  });

  it('sorts multiple matches by poisoning score descending', () => {
    expect(
      findSimilarAddresses('0x12345aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa5678', [
        '0x1234cccccccccccccccccccccccccccccccc5678',
        '0x12345eeeeeeeeeeeeeeeeeeeeeeeeeeeeeee5678',
      ]),
    ).toStrictEqual([
      {
        knownAddress: '0x12345eeeeeeeeeeeeeeeeeeeeeeeeeeeeeee5678',
        prefixMatchLength: 5,
        suffixMatchLength: 4,
        poisoningScore: 9,
        diffIndices: getNumberRange(7, 37),
      },
      {
        knownAddress: '0x1234cccccccccccccccccccccccccccccccc5678',
        prefixMatchLength: 4,
        suffixMatchLength: 4,
        poisoningScore: 8,
        diffIndices: getNumberRange(6, 37),
      },
    ]);
  });

  it('ignores non-hex candidate addresses', () => {
    expect(
      findSimilarAddresses('not-an-address', [CLASSIC_KNOWN]),
    ).toStrictEqual([]);
  });

  it('ignores non-hex known addresses', () => {
    expect(
      findSimilarAddresses(CLASSIC_CANDIDATE, ['not-an-address']),
    ).toStrictEqual([]);
  });

  it('ignores differently-sized known addresses', () => {
    expect(
      findSimilarAddresses(CLASSIC_CANDIDATE, [
        '0x1234bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb56789',
      ]),
    ).toStrictEqual([]);
  });
});
