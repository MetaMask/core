import { BigNumber } from 'bignumber.js';

/**
 * Band bounds in exact decimals, so `1 - 0.95` is exactly 0.05.
 *
 * @param referencePrice - Reference price.
 * @param maxDeviation - Deviation limit as a fraction.
 * @returns The bounds, or undefined when either input is unusable.
 */
function deviationBounds(
  referencePrice: number,
  maxDeviation: number,
): { min: BigNumber; max: BigNumber } | undefined {
  if (
    !Number.isFinite(referencePrice) ||
    referencePrice <= 0 ||
    !Number.isFinite(maxDeviation) ||
    maxDeviation <= 0 ||
    maxDeviation >= 1
  ) {
    return undefined;
  }
  const reference = new BigNumber(referencePrice);
  const ratio = new BigNumber(1).minus(maxDeviation);
  return {
    min: reference.multipliedBy(ratio),
    max: reference.dividedBy(ratio),
  };
}

/**
 * Prices a venue accepts around a reference price under a deviation limit
 * such as `PerpsOrderLimits.maxOraclePriceDeviation`: from `1 - maxDeviation`
 * times the reference up to the reference divided by it.
 *
 * @param referencePrice - Oracle price, or the mark price when the oracle is unknown.
 * @param maxDeviation - Deviation limit as a fraction, above 0 and below 1.
 * @returns The inclusive band, or undefined when either input is unusable.
 */
export function getPriceDeviationBand(
  referencePrice: number,
  maxDeviation: number,
): { min: number; max: number } | undefined {
  const bounds = deviationBounds(referencePrice, maxDeviation);
  return bounds && { min: bounds.min.toNumber(), max: bounds.max.toNumber() };
}

/**
 * Whether a price is outside the inclusive band {@link getPriceDeviationBand}
 * returns: below `1 - maxDeviation` times the reference, or above the
 * reference divided by it.
 *
 * @param price - Order price.
 * @param referencePrice - Oracle price, or the mark price when the oracle is unknown.
 * @param maxDeviation - Deviation limit as a fraction, such as
 * `PerpsOrderLimits.maxOraclePriceDeviation`.
 * @returns True when the price is outside the band; false when it is inside,
 * on a bound, or an input is missing, so unknown input never blocks an order.
 */
export function isPriceOutsideDeviationBand(
  price: number,
  referencePrice: number,
  maxDeviation: number,
): boolean {
  // Compare with the numbers getPriceDeviationBand returns, so a price on a
  // bound it reports is always inside.
  const band = getPriceDeviationBand(referencePrice, maxDeviation);
  if (band === undefined || !Number.isFinite(price) || price <= 0) {
    return false;
  }
  return price < band.min || price > band.max;
}
