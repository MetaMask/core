import {
  isVersionAtLeast,
  isVersionGatedFeatureFlagValue,
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

describe('isVersionGatedFeatureFlagValue', () => {
  it('returns true for valid versioned feature flag', () => {
    const versionedFlag = { fromVersion: '13.10.0', value: true };
    expect(isVersionGatedFeatureFlagValue(versionedFlag)).toBe(true);
  });

  it('returns true for versioned feature flag with object value', () => {
    const versionedFlag = { fromVersion: '13.10.0', value: { enabled: true } };
    expect(isVersionGatedFeatureFlagValue(versionedFlag)).toBe(true);
  });

  it('returns false for null', () => {
    expect(isVersionGatedFeatureFlagValue(null)).toBe(false);
  });

  it('returns false for primitives', () => {
    expect(isVersionGatedFeatureFlagValue(true)).toBe(false);
    expect(isVersionGatedFeatureFlagValue('string')).toBe(false);
    expect(isVersionGatedFeatureFlagValue(42)).toBe(false);
  });

  it('returns false for arrays', () => {
    expect(isVersionGatedFeatureFlagValue([1, 2, 3])).toBe(false);
  });

  it('returns false for objects missing fromVersion', () => {
    const flag = { value: true };
    expect(isVersionGatedFeatureFlagValue(flag)).toBe(false);
  });

  it('returns false for objects missing value', () => {
    const flag = { fromVersion: '13.10.0' };
    expect(isVersionGatedFeatureFlagValue(flag)).toBe(false);
  });

  it('returns false for objects with extra properties but missing required ones', () => {
    const flag = { fromVersion: '13.10.0', enabled: true }; // missing 'value'
    expect(isVersionGatedFeatureFlagValue(flag)).toBe(false);
  });

  it('returns true for objects with extra properties and required ones', () => {
    const flag = { fromVersion: '13.10.0', value: true, extra: 'data' };
    expect(isVersionGatedFeatureFlagValue(flag)).toBe(true);
  });
});
