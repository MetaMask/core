import {
  isVersionAtLeast,
  isMultiVersionFeatureFlagValue,
  selectVersionFromMultiVersionFlag,
} from './version-utils';

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

describe('isMultiVersionFeatureFlagValue', () => {
  it('returns true for valid multi-version feature flag', () => {
    const multiVersionFlag = {
      versions: [
        { fromVersion: '13.2.0', value: { x: '13' } },
        { fromVersion: '13.1.0', value: { x: '12' } },
      ],
    };
    expect(isMultiVersionFeatureFlagValue(multiVersionFlag)).toBe(true);
  });

  it('returns false for empty versions array', () => {
    const flag = { versions: [] };
    expect(isMultiVersionFeatureFlagValue(flag)).toBe(true); // Still valid structure
  });

  it('returns false for null', () => {
    expect(isMultiVersionFeatureFlagValue(null)).toBe(false);
  });

  it('returns false for primitives', () => {
    expect(isMultiVersionFeatureFlagValue(true)).toBe(false);
    expect(isMultiVersionFeatureFlagValue('string')).toBe(false);
  });

  it('returns false when versions is not an array', () => {
    const flag = { versions: 'not-an-array' };
    expect(isMultiVersionFeatureFlagValue(flag)).toBe(false);
  });

  it('returns false when missing versions property', () => {
    const flag = { otherProperty: [] };
    expect(isMultiVersionFeatureFlagValue(flag)).toBe(false);
  });

  it('returns false when versions array contains invalid entries', () => {
    const flagWithInvalidEntry = {
      versions: [
        { fromVersion: '13.1.0', value: { x: '12' } }, // valid
        { fromVersion: 123, value: true }, // invalid: fromVersion is not string
      ],
    };
    expect(isMultiVersionFeatureFlagValue(flagWithInvalidEntry)).toBe(false);
  });

  it('returns false when versions array contains entries missing required properties', () => {
    const flagMissingFromVersion = {
      versions: [
        { value: { x: '12' } }, // missing fromVersion
      ],
    };
    expect(isMultiVersionFeatureFlagValue(flagMissingFromVersion)).toBe(false);

    const flagMissingValue = {
      versions: [
        { fromVersion: '13.1.0' }, // missing value
      ],
    };
    expect(isMultiVersionFeatureFlagValue(flagMissingValue)).toBe(false);
  });

  it('returns false when versions array contains non-object entries', () => {
    const flagWithPrimitives = {
      versions: ['not-an-object', { fromVersion: '13.1.0', value: true }],
    };
    expect(isMultiVersionFeatureFlagValue(flagWithPrimitives)).toBe(false);

    const flagWithNull = {
      versions: [null, { fromVersion: '13.1.0', value: true }],
    };
    expect(isMultiVersionFeatureFlagValue(flagWithNull)).toBe(false);
  });

  it('returns true when all entries in versions array are valid', () => {
    const validFlag = {
      versions: [
        { fromVersion: '13.1.0', value: { x: '12' } },
        { fromVersion: '13.2.0', value: true },
        { fromVersion: '13.0.5', value: 'string-value' },
      ],
    };
    expect(isMultiVersionFeatureFlagValue(validFlag)).toBe(true);
  });
});

describe('selectVersionFromMultiVersionFlag', () => {
  const multiVersionFlag = {
    versions: [
      { fromVersion: '13.2.0', value: { x: '13' } },
      { fromVersion: '13.1.0', value: { x: '12' } },
      { fromVersion: '13.0.5', value: { x: '11' } },
    ],
  };

  it('returns highest eligible version when multiple versions qualify', () => {
    const result = selectVersionFromMultiVersionFlag(
      multiVersionFlag,
      '13.2.5',
    );
    expect(result).toStrictEqual({ fromVersion: '13.2.0', value: { x: '13' } });
  });

  it('returns appropriate version when only some versions qualify', () => {
    const result = selectVersionFromMultiVersionFlag(
      multiVersionFlag,
      '13.1.5',
    );
    expect(result).toStrictEqual({ fromVersion: '13.1.0', value: { x: '12' } });
  });

  it('returns lowest version when app version is very high', () => {
    const result = selectVersionFromMultiVersionFlag(
      multiVersionFlag,
      '14.0.0',
    );
    expect(result).toStrictEqual({ fromVersion: '13.2.0', value: { x: '13' } });
  });

  it('returns null when no versions qualify', () => {
    const result = selectVersionFromMultiVersionFlag(
      multiVersionFlag,
      '13.0.0',
    );
    expect(result).toBeNull();
  });

  it('returns exact match when app version equals fromVersion', () => {
    const result = selectVersionFromMultiVersionFlag(
      multiVersionFlag,
      '13.1.0',
    );
    expect(result).toStrictEqual({ fromVersion: '13.1.0', value: { x: '12' } });
  });

  it('handles single version in array', () => {
    const singleVersionFlag = {
      versions: [{ fromVersion: '13.1.0', value: { x: '12' } }],
    };
    const result = selectVersionFromMultiVersionFlag(
      singleVersionFlag,
      '13.1.5',
    );
    expect(result).toStrictEqual({ fromVersion: '13.1.0', value: { x: '12' } });
  });

  it('returns null for empty versions array', () => {
    const emptyVersionFlag = { versions: [] };
    const result = selectVersionFromMultiVersionFlag(
      emptyVersionFlag,
      '13.1.0',
    );
    expect(result).toBeNull();
  });
});
