import {
  isVersionAtLeast,
  isVersionFeatureFlag,
  getVersionData,
} from './version';

describe('isVersionAtLeast', () => {
  it('returns true when current version is greater than required version', () => {
    expect(isVersionAtLeast('13.10.0', '13.9.0')).toBe(true);
    expect(isVersionAtLeast('14.0.0', '13.10.0')).toBe(true);
    expect(isVersionAtLeast('13.9.6', '13.9.5')).toBe(true);
  });

  it('returns false when current version is less than required version', () => {
    expect(isVersionAtLeast('13.9.0', '13.10.0')).toBe(false);
    expect(isVersionAtLeast('13.5.0', '13.5.2')).toBe(false);
    expect(isVersionAtLeast('12.0.0', '13.0.0')).toBe(false);
  });

  it('returns true when versions are equal', () => {
    expect(isVersionAtLeast('13.10.0', '13.10.0')).toBe(true);
    expect(isVersionAtLeast('1.0.0', '1.0.0')).toBe(true);
  });

  it('handles versions with different number of components', () => {
    expect(isVersionAtLeast('13.10', '13.10.0')).toBe(true);
    expect(isVersionAtLeast('13.10.0', '13.10')).toBe(true);
    expect(isVersionAtLeast('13.9', '13.10.0')).toBe(false);
    expect(isVersionAtLeast('13.11', '13.10.0')).toBe(true);
  });

  it('handle single component versions', () => {
    expect(isVersionAtLeast('14', '13')).toBe(true);
    expect(isVersionAtLeast('13', '14')).toBe(false);
    expect(isVersionAtLeast('13', '13')).toBe(true);
  });

  it('handle versions with more than 3 components', () => {
    expect(isVersionAtLeast('13.10.0.1', '13.10.0.0')).toBe(true);
    expect(isVersionAtLeast('13.10.0.0', '13.10.0.1')).toBe(false);
  });
});

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

  it('returns true when versions is a valid object', () => {
    const validFlag = {
      versions: {
        '13.1.0': { x: '12' },
        '13.2.0': true,
        '13.0.5': 'string-value',
      },
    };
    expect(isVersionFeatureFlag(validFlag)).toBe(true);
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
    const result = getVersionData(multiVersionFlag, '13.2.5');
    expect(result).toStrictEqual({ x: '13' });
  });

  it('returns appropriate version when only some versions qualify', () => {
    const result = getVersionData(multiVersionFlag, '13.1.5');
    expect(result).toStrictEqual({ x: '12' });
  });

  it('returns lowest version when app version is very high', () => {
    const result = getVersionData(multiVersionFlag, '14.0.0');
    expect(result).toStrictEqual({ x: '13' });
  });

  it('returns null when no versions qualify', () => {
    const result = getVersionData(multiVersionFlag, '13.0.0');
    expect(result).toBeNull();
  });

  it('returns exact match when app version equals fromVersion', () => {
    const result = getVersionData(multiVersionFlag, '13.1.0');
    expect(result).toStrictEqual({ x: '12' });
  });

  it('handles single version in object', () => {
    const singleVersionFlag = {
      versions: { '13.1.0': { x: '12' } },
    };
    const result = getVersionData(singleVersionFlag, '13.1.5');
    expect(result).toStrictEqual({ x: '12' });
  });

  it('returns null for empty versions object', () => {
    const emptyVersionFlag = { versions: {} };
    const result = getVersionData(emptyVersionFlag, '13.1.0');
    expect(result).toBeNull();
  });
});
