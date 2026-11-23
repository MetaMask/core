import { describe, expect, it, vi } from 'vitest';

import { hasFeeSetter } from '../../../src/utils/feeSupport.js';

describe('hasFeeSetter', () => {
  it.each([
    [undefined, false],
    [{}, false],
    [{ setUserFeeResolution: vi.fn() }, true],
    [{ setUserFeeDiscount: vi.fn() }, true],
    [{ setUserFeeResolution: vi.fn(), setUserFeeDiscount: vi.fn() }, true],
  ] as const)('detects fee support on %j', (provider, expected) => {
    expect(hasFeeSetter(provider)).toBe(expected);
  });
});
