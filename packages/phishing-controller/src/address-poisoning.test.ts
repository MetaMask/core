import { findSimilarAddresses } from './address-poisoning';

describe('findSimilarAddresses', () => {
  it('returns a classic poisoning match with prefix, suffix, score, and diff indices', () => {
    expect(
      findSimilarAddresses('0x1234aaaa5678', ['0x1234bbbb5678']),
    ).toStrictEqual([
      {
        knownAddress: '0x1234bbbb5678',
        prefixMatchLength: 4,
        suffixMatchLength: 4,
        poisoningScore: 8,
        diffIndices: [6, 7, 8, 9],
      },
    ]);
  });

  it('excludes exact matches', () => {
    expect(
      findSimilarAddresses('0x1234567890abcdef', ['0x1234567890abcdef']),
    ).toStrictEqual([]);
  });

  it('matches case-insensitively', () => {
    expect(
      findSimilarAddresses('0xABCDaaaaEF12', ['0xabcdBBBBef12']),
    ).toStrictEqual([
      {
        knownAddress: '0xabcdBBBBef12',
        prefixMatchLength: 4,
        suffixMatchLength: 4,
        poisoningScore: 8,
        diffIndices: [6, 7, 8, 9],
      },
    ]);
  });

  it('skips partial matches below the default threshold', () => {
    expect(
      findSimilarAddresses('0x123aaaa567', ['0x123bbbb567']),
    ).toStrictEqual([]);
  });

  it('supports custom thresholds', () => {
    expect(
      findSimilarAddresses('0x123aaaa567', ['0x123bbbb567'], {
        prefixLen: 3,
        suffixLen: 3,
      }),
    ).toStrictEqual([
      {
        knownAddress: '0x123bbbb567',
        prefixMatchLength: 3,
        suffixMatchLength: 3,
        poisoningScore: 6,
        diffIndices: [5, 6, 7, 8],
      },
    ]);
  });

  it('sorts multiple matches by poisoning score descending', () => {
    expect(
      findSimilarAddresses('0x12345aaabbbb5678', [
        '0x1234ccccdddd5678',
        '0x12345eeeefaa5678',
      ]),
    ).toStrictEqual([
      {
        knownAddress: '0x12345eeeefaa5678',
        prefixMatchLength: 5,
        suffixMatchLength: 4,
        poisoningScore: 9,
        diffIndices: [7, 8, 9, 10, 11, 12, 13],
      },
      {
        knownAddress: '0x1234ccccdddd5678',
        prefixMatchLength: 4,
        suffixMatchLength: 4,
        poisoningScore: 8,
        diffIndices: [6, 7, 8, 9, 10, 11, 12, 13],
      },
    ]);
  });

  it('ignores non-hex and differently-sized addresses', () => {
    expect(
      findSimilarAddresses('not-an-address', [
        '0x1234bbbb5678',
        '0x1234bbbb56789',
      ]),
    ).toStrictEqual([]);
  });
});
