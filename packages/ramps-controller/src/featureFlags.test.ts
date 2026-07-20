import {
  MONEY_HEADLESS_ALL_PROVIDERS_FLAG_KEY,
  isHeadlessAllProvidersEnabled,
} from './featureFlags';

describe('MONEY_HEADLESS_ALL_PROVIDERS_FLAG_KEY', () => {
  it('matches the LaunchDarkly flag key', () => {
    expect(MONEY_HEADLESS_ALL_PROVIDERS_FLAG_KEY).toBe(
      'moneyHeadlessAllProviders',
    );
  });
});

describe('isHeadlessAllProvidersEnabled', () => {
  it('returns true when the remote flag is the literal boolean true', () => {
    expect(
      isHeadlessAllProvidersEnabled({
        remoteFeatureFlags: { [MONEY_HEADLESS_ALL_PROVIDERS_FLAG_KEY]: true },
      }),
    ).toBe(true);
  });

  it('returns false when the remote flag is false', () => {
    expect(
      isHeadlessAllProvidersEnabled({
        remoteFeatureFlags: { [MONEY_HEADLESS_ALL_PROVIDERS_FLAG_KEY]: false },
      }),
    ).toBe(false);
  });

  it('returns false when the flag is missing', () => {
    expect(isHeadlessAllProvidersEnabled({ remoteFeatureFlags: {} })).toBe(
      false,
    );
  });

  it('returns false for null or undefined state', () => {
    expect(isHeadlessAllProvidersEnabled(null)).toBe(false);
    expect(isHeadlessAllProvidersEnabled(undefined)).toBe(false);
  });

  it.each([
    ['the string "true"', 'true'],
    ['a number', 1],
    ['an object', { enabled: true }],
    ['an array', [true]],
    ['null', null],
    ['a scope string', 'all'],
  ])('returns false when the flag value is %s', (_description, value) => {
    expect(
      isHeadlessAllProvidersEnabled({
        remoteFeatureFlags: { [MONEY_HEADLESS_ALL_PROVIDERS_FLAG_KEY]: value },
      }),
    ).toBe(false);
  });

  it('honors a localOverrides true value when the remote flag is missing', () => {
    expect(
      isHeadlessAllProvidersEnabled({
        remoteFeatureFlags: {},
        localOverrides: { [MONEY_HEADLESS_ALL_PROVIDERS_FLAG_KEY]: true },
      }),
    ).toBe(true);
  });

  it('honors a localOverrides true value over a remote false value', () => {
    expect(
      isHeadlessAllProvidersEnabled({
        remoteFeatureFlags: { [MONEY_HEADLESS_ALL_PROVIDERS_FLAG_KEY]: false },
        localOverrides: { [MONEY_HEADLESS_ALL_PROVIDERS_FLAG_KEY]: true },
      }),
    ).toBe(true);
  });

  it('honors a localOverrides false value over a remote true value', () => {
    expect(
      isHeadlessAllProvidersEnabled({
        remoteFeatureFlags: { [MONEY_HEADLESS_ALL_PROVIDERS_FLAG_KEY]: true },
        localOverrides: { [MONEY_HEADLESS_ALL_PROVIDERS_FLAG_KEY]: false },
      }),
    ).toBe(false);
  });

  it('ignores unrelated local overrides', () => {
    expect(
      isHeadlessAllProvidersEnabled({
        remoteFeatureFlags: { [MONEY_HEADLESS_ALL_PROVIDERS_FLAG_KEY]: true },
        localOverrides: { someOtherFlag: false },
      }),
    ).toBe(true);
  });
});
