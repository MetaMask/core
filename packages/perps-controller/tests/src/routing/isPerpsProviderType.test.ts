import { describe, expect, it } from 'vitest';

import { isPerpsProviderType } from '../../../src/routing/isPerpsProviderType.js';

describe('isPerpsProviderType', () => {
  it.each(['hyperliquid', 'lighter'])(
    'accepts the direct venue %s',
    (value) => {
      expect(isPerpsProviderType(value)).toBe(true);
    },
  );

  it.each([
    undefined,
    null,
    '',
    'aggregated',
    'unknown',
    '__proto__',
    'constructor',
    'prototype',
    false,
    true,
    42,
    {},
    [],
  ])('rejects a value outside the direct venue set: %j', (value) => {
    expect(isPerpsProviderType(value)).toBe(false);
  });
});
