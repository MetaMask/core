import { isConfigRegistryApiEnabled } from './feature-flags';

describe('isConfigRegistryApiEnabled', () => {
  it('returns true when the feature flag value is true', () => {
    expect(isConfigRegistryApiEnabled(true)).toBe(true);
  });

  it('returns false when the feature flag value is false', () => {
    expect(isConfigRegistryApiEnabled(false)).toBe(false);
  });

  it.each([{}, 'some value', null])(
    'returns false when the feature flag value is not a boolean',
    (featureFlag) => {
      expect(isConfigRegistryApiEnabled(featureFlag)).toBe(false);
    },
  );
});
