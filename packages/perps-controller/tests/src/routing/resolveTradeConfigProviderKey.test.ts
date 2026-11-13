import { describe, expect, it } from 'vitest';

import { resolveTradeConfigProviderKey } from '../../../src/routing/resolveTradeConfigProviderKey.js';

const fallbackState = Object.freeze({
  activeProvider: 'aggregated',
  defaultProvider: 'lighter',
  effectiveProvider: 'hyperliquid',
} as const);

describe('resolveTradeConfigProviderKey', () => {
  it.each(['hyperliquid', 'lighter'] as const)(
    'honors the explicit %s override over the effective venue and preference',
    (providerId) => {
      expect(resolveTradeConfigProviderKey(fallbackState, providerId)).toBe(
        providerId,
      );
    },
  );

  it('uses the effective fallback without changing the saved preference', () => {
    expect(resolveTradeConfigProviderKey(fallbackState)).toBe('hyperliquid');
    expect(fallbackState.defaultProvider).toBe('lighter');
  });

  it.each([
    ['hyperliquid', 'lighter'],
    ['lighter', 'hyperliquid'],
  ] as const)(
    'uses the selected direct %s venue rather than saved default %s when no effective route is assigned',
    (activeProvider, defaultProvider) => {
      expect(
        resolveTradeConfigProviderKey({
          activeProvider,
          defaultProvider,
          effectiveProvider: null,
        }),
      ).toBe(activeProvider);
    },
  );

  it.each([
    ['hyperliquid', 'lighter'],
    ['lighter', 'hyperliquid'],
  ] as const)(
    'prefers the effective venue %s over the selected direct venue %s',
    (effectiveProvider, activeProvider) => {
      expect(
        resolveTradeConfigProviderKey({
          activeProvider,
          defaultProvider: 'hyperliquid',
          effectiveProvider,
        }),
      ).toBe(effectiveProvider);
    },
  );

  it.each(['hyperliquid', 'lighter'] as const)(
    'uses the saved aggregated %s default when no effective route is assigned',
    (defaultProvider) => {
      expect(
        resolveTradeConfigProviderKey({
          activeProvider: 'aggregated',
          defaultProvider,
          effectiveProvider: null,
        }),
      ).toBe(defaultProvider);
    },
  );

  it('uses HyperLiquid when selector state is absent', () => {
    expect(resolveTradeConfigProviderKey(undefined)).toBe('hyperliquid');
    expect(resolveTradeConfigProviderKey(undefined, 'lighter')).toBe('lighter');
  });

  it.each([
    '',
    'unknown',
    'aggregated',
    '__proto__',
    'constructor',
    'prototype',
    null,
    false,
    42,
  ])(
    'rejects an invalid explicit provider %j instead of falling back',
    (providerId) => {
      expect(
        // @ts-expect-error JavaScript callers can supply invalid provider values.
        resolveTradeConfigProviderKey(fallbackState, providerId),
      ).toBeNull();
    },
  );

  it.each([
    '',
    'unknown',
    'aggregated',
    '__proto__',
    'constructor',
    'prototype',
    false,
    42,
  ])(
    'safely falls back from an invalid effective provider %j rather than using the preference',
    (effectiveProvider) => {
      const state = { ...fallbackState, effectiveProvider };
      // @ts-expect-error Persisted snapshots may contain invalid routing values.
      expect(resolveTradeConfigProviderKey(state)).toBe('hyperliquid');
    },
  );

  it.each([
    '',
    'unknown',
    'aggregated',
    '__proto__',
    'constructor',
    'prototype',
    null,
    false,
    42,
  ])(
    'safely falls back from an invalid saved aggregated default %j',
    (defaultProvider) => {
      const state = {
        ...fallbackState,
        defaultProvider,
        effectiveProvider: null,
      };
      // @ts-expect-error Persisted snapshots may contain invalid routing values.
      expect(resolveTradeConfigProviderKey(state)).toBe('hyperliquid');
    },
  );

  it.each([
    '',
    'unknown',
    '__proto__',
    'constructor',
    'prototype',
    null,
    false,
    42,
  ])(
    'safely falls back from an invalid selected direct provider %j',
    (activeProvider) => {
      const state = {
        ...fallbackState,
        activeProvider,
        effectiveProvider: null,
      };
      // @ts-expect-error Persisted snapshots may contain invalid routing values.
      expect(resolveTradeConfigProviderKey(state)).toBe('hyperliquid');
    },
  );
});
