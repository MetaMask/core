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
  if (
    !Number.isFinite(referencePrice) ||
    referencePrice <= 0 ||
    !Number.isFinite(maxDeviation) ||
    maxDeviation <= 0 ||
    maxDeviation >= 1
  ) {
    return undefined;
  }
  const ratio = 1 - maxDeviation;
  return { min: ratio * referencePrice, max: referencePrice / ratio };
}

/**
 * Whether a price is further from the reference price than a deviation limit
 * allows: the lower of the two is below `1 - maxDeviation` times the higher.
 *
 * @param price - Order price.
 * @param referencePrice - Oracle price, or the mark price when the oracle is unknown.
 * @param maxDeviation - Deviation limit as a fraction, such as
 * `PerpsOrderLimits.maxOraclePriceDeviation`.
 * @returns True when the price is outside the band; false when it is inside
 * or a price is missing, so unknown input never blocks an order.
 */
export function isPriceOutsideDeviationBand(
  price: number,
  referencePrice: number,
  maxDeviation: number,
): boolean {
  if (
    !Number.isFinite(price) ||
    !Number.isFinite(referencePrice) ||
    price <= 0 ||
    referencePrice <= 0
  ) {
    return false;
  }
  return (
    Math.min(price, referencePrice) <
    (1 - maxDeviation) * Math.max(price, referencePrice)
  );
}
