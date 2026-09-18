import { convertAprToApy } from './utils.js';

describe('convertAprToApy', () => {
  it('returns undefined when APR is undefined', () => {
    expect(convertAprToApy(undefined)).toBeUndefined();
  });

  it('returns zero when APR is zero', () => {
    expect(convertAprToApy(0)).toBe(0);
  });

  it('converts APR to APY using daily compounding', () => {
    expect(convertAprToApy(0.05)).toBeCloseTo(0.05126749646744733, 15);
  });
});
