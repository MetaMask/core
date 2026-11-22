import { describe, expect, it } from 'vitest';

import {
  calculateFeeNotionalUsd,
  calculateUndiscountedFeeAmount,
  getUndiscountedFeeRate,
} from '../../../src/utils/feeAmounts.js';

const discounted = {
  feeRate: 0.0008,
  protocolFeeRate: 0.00045,
  metamaskFeeRate: 0.00035,
  undiscountedMetamaskFeeRate: 0.001,
};

describe('calculateFeeNotionalUsd', () => {
  it('uses the absolute USD amount', () => {
    expect(calculateFeeNotionalUsd({ usdAmount: '-1,000' })).toBe(1000);
  });

  it('values a signed size at the price', () => {
    expect(calculateFeeNotionalUsd({ size: '-2', price: '$1,500' })).toBe(3000);
  });

  it('applies the close percent and multiplier', () => {
    expect(
      calculateFeeNotionalUsd({ size: 2, price: 1500, closePercent: 50 }),
    ).toBe(1500);
    expect(calculateFeeNotionalUsd({ usdAmount: 1000, multiplier: 2 })).toBe(
      2000,
    );
  });

  it('values a TP/SL pair at its higher trigger price', () => {
    expect(calculateFeeNotionalUsd({ size: 2, price: ['1,200', 1500] })).toBe(
      3000,
    );
    expect(calculateFeeNotionalUsd({ size: 2, price: [1800, '$1,500'] })).toBe(
      3600,
    );
    expect(
      calculateFeeNotionalUsd({ size: 2, price: [1500, 'abc'] }),
    ).toBeUndefined();
  });

  it.each([
    { usdAmount: '' },
    { usdAmount: 'abc' },
    { usdAmount: '12oops' },
    { size: 1, price: '100x' },
    { size: 'x', price: 100 },
    { size: 1, price: '' },
    { usdAmount: 100, closePercent: Number.NaN },
  ])('returns undefined for %o', (params) => {
    expect(calculateFeeNotionalUsd(params)).toBeUndefined();
  });
});

describe('getUndiscountedFeeRate', () => {
  it('adds the undiscounted MetaMask rate to the protocol rate', () => {
    expect(getUndiscountedFeeRate(discounted)).toBe(0.00045 + 0.001);
  });

  it('returns feeRate when no discount applied', () => {
    expect(
      getUndiscountedFeeRate({
        ...discounted,
        metamaskFeeRate: 0.001,
        feeRate: 0.00145,
      }),
    ).toBe(0.00145);
  });

  it('returns feeRate when the undiscounted or protocol rate is unknown', () => {
    expect(
      getUndiscountedFeeRate({
        ...discounted,
        undiscountedMetamaskFeeRate: undefined,
      }),
    ).toBe(0.0008);
    expect(
      getUndiscountedFeeRate({ ...discounted, protocolFeeRate: undefined }),
    ).toBe(0.0008);
  });

  it('returns undefined when nothing is known', () => {
    expect(getUndiscountedFeeRate({})).toBeUndefined();
  });
});

describe('calculateUndiscountedFeeAmount', () => {
  it('charges the undiscounted rate on the notional', () => {
    expect(
      calculateUndiscountedFeeAmount({
        notionalUsd: 1000,
        feeResult: discounted,
      }),
    ).toBe(1000 * (0.00045 + 0.001));
  });

  it('returns undefined without a notional or rate', () => {
    expect(
      calculateUndiscountedFeeAmount({
        notionalUsd: undefined,
        feeResult: discounted,
      }),
    ).toBeUndefined();
    expect(
      calculateUndiscountedFeeAmount({ notionalUsd: 1000, feeResult: {} }),
    ).toBeUndefined();
    expect(
      calculateUndiscountedFeeAmount({
        notionalUsd: Number.POSITIVE_INFINITY,
        feeResult: discounted,
      }),
    ).toBeUndefined();
  });
});
