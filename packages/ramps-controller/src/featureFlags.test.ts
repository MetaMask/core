import type { Json } from '@metamask/utils';

import {
  HEADLESS_ALLOWLIST_SURFACES,
  MONEY_HEADLESS_ALL_PROVIDERS_FLAG_KEY,
  getHeadlessProviderAllowlist,
  isHeadlessAllProvidersEnabled,
  normalizeHeadlessProviderId,
} from './featureFlags.js';

describe('MONEY_HEADLESS_ALL_PROVIDERS_FLAG_KEY', () => {
  it('matches the LaunchDarkly flag key', () => {
    expect(MONEY_HEADLESS_ALL_PROVIDERS_FLAG_KEY).toBe(
      'moneyHeadlessAllProviders',
    );
  });
});

describe('HEADLESS_ALLOWLIST_SURFACES', () => {
  it('matches the canonical payload surface keys', () => {
    expect(HEADLESS_ALLOWLIST_SURFACES).toStrictEqual({
      MONEY: 'money',
      PERPS: 'perps',
      PREDICTIONS: 'predictions',
    });
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
    ['an empty object', {}],
    ['an object with enabled false', { enabled: false }],
    ['an object with a non-boolean enabled', { enabled: 'true' }],
    [
      'an object with providerIds but no enabled',
      { providerIds: ['/providers/moonpay'] },
    ],
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

  it('returns true for an object payload whose enabled is the literal true', () => {
    expect(
      isHeadlessAllProvidersEnabled({
        remoteFeatureFlags: {
          [MONEY_HEADLESS_ALL_PROVIDERS_FLAG_KEY]: { enabled: true },
        },
      }),
    ).toBe(true);
  });

  it('returns true for an enabled object payload carrying provider ids', () => {
    expect(
      isHeadlessAllProvidersEnabled({
        remoteFeatureFlags: {
          [MONEY_HEADLESS_ALL_PROVIDERS_FLAG_KEY]: {
            enabled: true,
            providerIds: ['/providers/moonpay'],
          },
        },
      }),
    ).toBe(true);
  });

  it('honors a localOverrides object payload over a remote boolean', () => {
    expect(
      isHeadlessAllProvidersEnabled({
        remoteFeatureFlags: { [MONEY_HEADLESS_ALL_PROVIDERS_FLAG_KEY]: false },
        localOverrides: {
          [MONEY_HEADLESS_ALL_PROVIDERS_FLAG_KEY]: { enabled: true },
        },
      }),
    ).toBe(true);
    expect(
      isHeadlessAllProvidersEnabled({
        remoteFeatureFlags: { [MONEY_HEADLESS_ALL_PROVIDERS_FLAG_KEY]: true },
        localOverrides: {
          [MONEY_HEADLESS_ALL_PROVIDERS_FLAG_KEY]: { enabled: false },
        },
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

describe('getHeadlessProviderAllowlist', () => {
  const stateWithFlag = (
    value: unknown,
  ): { remoteFeatureFlags: Record<string, Json> } => ({
    remoteFeatureFlags: {
      [MONEY_HEADLESS_ALL_PROVIDERS_FLAG_KEY]: value as Json,
    },
  });

  it.each([
    ['the boolean true', true],
    ['the boolean false', false],
    ['a string', 'all'],
    ['a number', 1],
    ['an array', ['/providers/moonpay']],
    ['null', null],
  ])('returns undefined when the flag value is %s', (_description, value) => {
    expect(getHeadlessProviderAllowlist(stateWithFlag(value))).toBeUndefined();
  });

  it('returns undefined for null or undefined state and a missing flag', () => {
    expect(getHeadlessProviderAllowlist(null)).toBeUndefined();
    expect(getHeadlessProviderAllowlist(undefined)).toBeUndefined();
    expect(
      getHeadlessProviderAllowlist({ remoteFeatureFlags: {} }),
    ).toBeUndefined();
  });

  it('returns undefined when the payload is not enabled, even with provider ids', () => {
    expect(
      getHeadlessProviderAllowlist(
        stateWithFlag({
          enabled: false,
          providerIds: ['/providers/moonpay'],
        }),
      ),
    ).toBeUndefined();
    expect(
      getHeadlessProviderAllowlist(
        stateWithFlag({ providerIds: ['/providers/moonpay'] }),
      ),
    ).toBeUndefined();
  });

  it('returns the top-level providerIds as listed', () => {
    expect(
      getHeadlessProviderAllowlist(
        stateWithFlag({
          enabled: true,
          providerIds: ['/providers/moonpay', 'coinbasepay'],
        }),
      ),
    ).toStrictEqual(['/providers/moonpay', 'coinbasepay']);
  });

  it('returns undefined for an enabled payload without providerIds', () => {
    expect(
      getHeadlessProviderAllowlist(stateWithFlag({ enabled: true })),
    ).toBeUndefined();
  });

  it('drops non-string entries and trims strings', () => {
    expect(
      getHeadlessProviderAllowlist(
        stateWithFlag({
          enabled: true,
          providerIds: [' /providers/moonpay ', 42, null, '', {}],
        }),
      ),
    ).toStrictEqual(['/providers/moonpay']);
  });

  it.each([
    ['an empty providerIds list', { enabled: true, providerIds: [] }],
    [
      'an all-invalid providerIds list',
      { enabled: true, providerIds: [1, null, ''] },
    ],
    ['a non-array providerIds', { enabled: true, providerIds: 'moonpay' }],
  ])('returns undefined for %s', (_description, value) => {
    expect(getHeadlessProviderAllowlist(stateWithFlag(value))).toBeUndefined();
  });

  it('ignores unknown extra keys in the payload', () => {
    expect(
      getHeadlessProviderAllowlist(
        stateWithFlag({
          enabled: true,
          providerIds: ['/providers/moonpay'],
          somethingElse: { nested: true },
        }),
      ),
    ).toStrictEqual(['/providers/moonpay']);
  });

  describe('surfaces', () => {
    const payload = {
      enabled: true,
      providerIds: ['/providers/moonpay'],
      surfaces: {
        [HEADLESS_ALLOWLIST_SURFACES.MONEY]: ['/providers/transak'],
        [HEADLESS_ALLOWLIST_SURFACES.PERPS]: [],
      },
    };

    it('lets a surface entry override the top-level list for that surface', () => {
      expect(
        getHeadlessProviderAllowlist(
          stateWithFlag(payload),
          HEADLESS_ALLOWLIST_SURFACES.MONEY,
        ),
      ).toStrictEqual(['/providers/transak']);
    });

    it('falls back to the top-level list for a surface not in the payload', () => {
      expect(
        getHeadlessProviderAllowlist(
          stateWithFlag(payload),
          HEADLESS_ALLOWLIST_SURFACES.PREDICTIONS,
        ),
      ).toStrictEqual(['/providers/moonpay']);
    });

    it('falls back to the top-level list for an empty surface entry', () => {
      expect(
        getHeadlessProviderAllowlist(
          stateWithFlag(payload),
          HEADLESS_ALLOWLIST_SURFACES.PERPS,
        ),
      ).toStrictEqual(['/providers/moonpay']);
    });

    it('uses the top-level list when no surface is given', () => {
      expect(
        getHeadlessProviderAllowlist(stateWithFlag(payload)),
      ).toStrictEqual(['/providers/moonpay']);
    });

    it('returns a surface list even when the top-level list is absent', () => {
      expect(
        getHeadlessProviderAllowlist(
          stateWithFlag({
            enabled: true,
            surfaces: { money: ['/providers/transak'] },
          }),
          'money',
        ),
      ).toStrictEqual(['/providers/transak']);
    });

    it.each([
      ['a string', 'money'],
      ['an array', [['/providers/transak']]],
      ['null', null],
    ])('ignores surfaces when it is %s', (_description, surfaces) => {
      expect(
        getHeadlessProviderAllowlist(
          stateWithFlag({
            enabled: true,
            providerIds: ['/providers/moonpay'],
            surfaces,
          }),
          'money',
        ),
      ).toStrictEqual(['/providers/moonpay']);
    });
  });

  it('honors a localOverrides payload over the remote payload', () => {
    expect(
      getHeadlessProviderAllowlist({
        remoteFeatureFlags: {
          [MONEY_HEADLESS_ALL_PROVIDERS_FLAG_KEY]: {
            enabled: true,
            providerIds: ['/providers/moonpay'],
          },
        },
        localOverrides: {
          [MONEY_HEADLESS_ALL_PROVIDERS_FLAG_KEY]: {
            enabled: true,
            providerIds: ['/providers/coinbasepay'],
          },
        },
      }),
    ).toStrictEqual(['/providers/coinbasepay']);
  });

  it('returns undefined when a malformed localOverrides value shadows a valid remote payload', () => {
    expect(
      getHeadlessProviderAllowlist({
        remoteFeatureFlags: {
          [MONEY_HEADLESS_ALL_PROVIDERS_FLAG_KEY]: {
            enabled: true,
            providerIds: ['/providers/moonpay'],
          },
        },
        localOverrides: { [MONEY_HEADLESS_ALL_PROVIDERS_FLAG_KEY]: 'oops' },
      }),
    ).toBeUndefined();
  });
});

describe('normalizeHeadlessProviderId', () => {
  it.each([
    ['/providers/moonpay', 'moonpay'],
    ['moonpay', 'moonpay'],
    [' /providers/MoonPay ', 'moonpay'],
    ['/providers/transak-staging', 'transak-staging'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeHeadlessProviderId(input)).toBe(expected);
  });
});
