import { BigNumber } from 'bignumber.js';

/**
 * Prices a venue accepts around a reference price under a deviation limit
 * such as `PerpsOrderLimits.maxOraclePriceDeviation`: up to `maxDeviation`
 * times the reference away from it on either side, so a price `p` is inside
 * when `|p - reference| / reference <= maxDeviation`. HyperLiquid's rule
 * ("Order price cannot be more than 95% away from the reference price") and
 * `isMarketTradable` use this band. The lower bound never goes below 0.
 * Bounds are computed in exact decimals, so `1 - 0.95` is exactly 0.05.
 *
 * @param referencePrice - Oracle price, or the mark price when the oracle is unknown.
 * @param maxDeviation - Deviation limit as a positive fraction.
 * @returns The inclusive band, or undefined when either input is unusable.
 */
export function getPriceDeviationBand(
  referencePrice: number,
  maxDeviation: number,
): { min: number; max: number } | undefined {
  if (
    !Number.isFinite(referencePrice) ||
    referencePrice <= 0 ||
    !Number.isFinite(maxDeviation) ||
    maxDeviation <= 0
  ) {
    return undefined;
  }
  const reference = new BigNumber(referencePrice);
  const offset = reference.multipliedBy(maxDeviation);
  return {
    min: BigNumber.max(reference.minus(offset), 0).toNumber(),
    max: reference.plus(offset).toNumber(),
  };
}

/**
 * Whether a price is outside the inclusive band {@link getPriceDeviationBand}
 * returns, i.e. more than `maxDeviation` times the reference away from it.
 *
 * @param price - Order or market price.
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
