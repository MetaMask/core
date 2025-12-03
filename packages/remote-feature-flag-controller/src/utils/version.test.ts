import type { SemVerVersion } from '@metamask/utils';

import { isVersionFeatureFlag, getVersionData } from './version';

describe('isVersionFeatureFlag', () => {
  it('returns true for valid multi-version feature flag', () => {
    const multiVersionFlag = {
      versions: {
        '13.1.0': { x: '12' },
        '13.2.0': { x: '13' },
      },
    };
    expect(isVersionFeatureFlag(multiVersionFlag)).toBe(true);
  });

  it('returns true for empty versions object', () => {
    const flag = { versions: {} };
    expect(isVersionFeatureFlag(flag)).toBe(true); // Still valid structure
  });

  it('returns false for null', () => {
    expect(isVersionFeatureFlag(null)).toBe(false);
  });

  it('returns false for primitives', () => {
    expect(isVersionFeatureFlag(true)).toBe(false);
    expect(isVersionFeatureFlag('string')).toBe(false);
  });

  it('returns false when versions is not an object', () => {
    const flag = { versions: 'not-an-object' };
    expect(isVersionFeatureFlag(flag)).toBe(false);
  });

  it('returns false when missing versions property', () => {
    const flag = { otherProperty: [] };
    expect(isVersionFeatureFlag(flag)).toBe(false);
  });

  it('returns false when versions is an array', () => {
    const flagWithArray = {
      versions: [
        { fromVersion: '13.1.0', data: { x: '12' } },
        { fromVersion: '13.2.0', data: true },
      ],
    };
    expect(isVersionFeatureFlag(flagWithArray)).toBe(false);
  });

  it('returns false when versions is null', () => {
    const flagWithNull = {
      versions: null,
    };
    expect(isVersionFeatureFlag(flagWithNull)).toBe(false);
  });

  it('returns false when versions is a primitive', () => {
    const flagWithString = {
      versions: 'not-an-object',
    };
    expect(isVersionFeatureFlag(flagWithString)).toBe(false);

    const flagWithNumber = {
      versions: 123,
    };
    expect(isVersionFeatureFlag(flagWithNumber)).toBe(false);
  });

  it('returns true when versions is a valid object with valid SemVer keys', () => {
    const validFlag = {
      versions: {
        '13.1.0': { x: '12' },
        '13.2.0': true,
        '13.0.5': 'string-value',
      },
    };
    expect(isVersionFeatureFlag(validFlag)).toBe(true);
  });

  it('returns false when version keys are not valid SemVer', () => {
    const flagWithInvalidVersions = {
      versions: {
        '13.10': { x: '12' }, // Not valid SemVer (missing patch)
        '13.2.0': { x: '13' },
      },
    };
    expect(isVersionFeatureFlag(flagWithInvalidVersions)).toBe(false);
  });

  it('returns false when version keys contain single component versions', () => {
    const flagWithSingleComponent = {
      versions: {
        '13': { x: '12' }, // Not valid SemVer
        '14.0.0': { x: '13' },
      },
    };
    expect(isVersionFeatureFlag(flagWithSingleComponent)).toBe(false);
  });

  it('returns false when version keys contain 4+ component versions', () => {
    const flagWithFourComponents = {
      versions: {
        '13.10.0.1': { x: '12' }, // Not valid SemVer
        '13.2.0': { x: '13' },
      },
    };
    expect(isVersionFeatureFlag(flagWithFourComponents)).toBe(false);
  });

  it('returns false when version keys are invalid strings', () => {
    const flagWithInvalidStrings = {
      versions: {
        'invalid-version': { x: '12' },
        '13.2.0': { x: '13' },
      },
    };
    expect(isVersionFeatureFlag(flagWithInvalidStrings)).toBe(false);
  });
});

describe('getVersionData', () => {
  const multiVersionFlag = {
    versions: {
      // The object keys can be in any order since we sort them
      '13.0.5': { x: '11' },
      '13.2.0': { x: '13' },
      '13.1.0': { x: '12' },
    },
  };

  it('returns highest eligible version when multiple versions qualify', () => {
    const result = getVersionData(multiVersionFlag, '13.2.5' as SemVerVersion);
    expect(result).toStrictEqual({ x: '13' });
  });

  it('returns appropriate version when only some versions qualify', () => {
    const result = getVersionData(multiVersionFlag, '13.1.5' as SemVerVersion);
    expect(result).toStrictEqual({ x: '12' });
  });

  it('returns lowest version when app version is very high', () => {
    const result = getVersionData(multiVersionFlag, '14.0.0' as SemVerVersion);
    expect(result).toStrictEqual({ x: '13' });
  });

  it('returns null when no versions qualify', () => {
    const result = getVersionData(multiVersionFlag, '13.0.0' as SemVerVersion);
    expect(result).toBeNull();
  });

  it('returns exact match when app version equals fromVersion', () => {
    const result = getVersionData(multiVersionFlag, '13.1.0' as SemVerVersion);
    expect(result).toStrictEqual({ x: '12' });
  });

  it('handles single version in object', () => {
    const singleVersionFlag = {
      versions: { '13.1.0': { x: '12' } },
    };
    const result = getVersionData(singleVersionFlag, '13.1.5' as SemVerVersion);
    expect(result).toStrictEqual({ x: '12' });
  });

  it('returns null for empty versions object', () => {
    const emptyVersionFlag = { versions: {} };
    const result = getVersionData(emptyVersionFlag, '13.1.0' as SemVerVersion);
    expect(result).toBeNull();
  });
});
