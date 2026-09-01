import { formatHyperLiquidPrice } from '../../../src/utils/hyperLiquidAdapter.js';

describe('formatHyperLiquidPrice', () => {
  it('returns an integer price unchanged', () => {
    expect(formatHyperLiquidPrice({ price: 50000, szDecimals: 3 })).toBe(
      '50000',
    );
  });

  it('rounds a price >= 1 to the decimal-place grid, then to 5 significant figures', () => {
    expect(
      formatHyperLiquidPrice({ price: 2999.14159, szDecimals: 4 }),
    ).toBe('2999.1');
  });

  // Regression: countSignificantFigures used to miscount every sub-$1 price
  // as having far more significant figures than it does, so a price that was
  // already within HyperLiquid's 5-significant-figure limit got needlessly
  // re-rounded and lost a real digit of precision.
  it.each([
    ['0.001234', 0],
    ['0.000463', 0],
    ['0.000171', 0],
  ])('preserves full precision for %s (szDecimals=%s)', (price, szDecimals) => {
    expect(formatHyperLiquidPrice({ price, szDecimals })).toBe(price);
  });

  it('still rounds a sub-$1 price that genuinely exceeds 5 significant figures', () => {
    expect(
      formatHyperLiquidPrice({ price: '0.00123456', szDecimals: 0 }),
    ).toBe('0.001235');
  });
});
