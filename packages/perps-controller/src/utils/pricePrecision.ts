import { BigNumber } from 'bignumber.js';

import type { PerpsPricePrecision } from '../types/index.js';
import { countSignificantFigures } from './significantFigures.js';

/**
 * Round a price onto a significant-figures grid (Hyperliquid). Integers are
 * kept as they are. Otherwise the decimals are capped, then the significant
 * figures, both rounding half up on the price's decimal form, so 69.9425
 * becomes 69.943 as on hyperliquid.xyz rather than 69.942 from its binary
 * float.
 *
 * @param price - Price in quote units.
 * @param maxDecimals - Maximum decimal places.
 * @param maxSignificantFigures - Maximum significant figures for a fractional price.
 * @returns The rounded price string.
 */
export function roundToSignificantFiguresGrid(
  price: number | string,
  maxDecimals: number,
  maxSignificantFigures: number,
): string {
  const priceNum = Number.parseFloat(String(price));
  if (Number.isInteger(priceNum)) {
    return priceNum.toString();
  }
  let rounded = new BigNumber(String(priceNum)).decimalPlaces(
    maxDecimals,
    BigNumber.ROUND_HALF_UP,
  );
  if (countSignificantFigures(rounded.toFixed()) > maxSignificantFigures) {
    const integerDigits = rounded
      .integerValue(BigNumber.ROUND_DOWN)
      .abs()
      .toFixed()
      .replace(/^0$/u, '').length;
    rounded = rounded.decimalPlaces(
      Math.max(maxSignificantFigures - integerDigits, 0),
      BigNumber.ROUND_HALF_UP,
    );
  }
  return rounded.toFixed();
}

/**
 * Round a price onto the grid a market accepts, as reported in
 * `PerpsOrderCapabilities.pricePrecision`. A `significant_figures` grid
 * (Hyperliquid) uses `roundToSignificantFiguresGrid`, the same rounding as
 * `formatHyperLiquidPrice`. A `fixed_decimals` grid (Lighter) rounds half up
 * to the nearest multiple of its tick.
 *
 * @param params - Rounding parameters.
 * @param params.price - Price in quote units.
 * @param params.pricePrecision - The market's price grid.
 * @returns The rounded price, or undefined when the price is not a positive
 * number, rounds to zero, or the tick is unusable.
 */
export function roundPerpsPrice(params: {
  price: number | string;
  pricePrecision: PerpsPricePrecision;
}): string | undefined {
  const { price, pricePrecision } = params;
  const priceNum = Number.parseFloat(String(price));
  if (!Number.isFinite(priceNum) || priceNum <= 0) {
    return undefined;
  }

  let rounded: string;
  if (pricePrecision.type === 'fixed_decimals') {
    const tick = new BigNumber(pricePrecision.tickSize);
    if (!tick.isFinite() || tick.lte(0)) {
      return undefined;
    }
    // Read the caller's decimal string, not its float: 1.004999999999999999
    // would otherwise become 1.005 and round up.
    const exact = new BigNumber(String(price).trim());
    if (!exact.isFinite() || exact.lte(0)) {
      return undefined;
    }
    // Exact remainder, not a quotient: division rounds to 20 decimals and
    // could turn a value just under a half tick into exactly half.
    const remainder = exact.modulo(tick);
    const down = exact.minus(remainder);
    rounded = (
      remainder.multipliedBy(2).gte(tick) ? down.plus(tick) : down
    ).toFixed();
  } else {
    rounded = roundToSignificantFiguresGrid(
      priceNum,
      pricePrecision.maxDecimals,
      pricePrecision.maxSignificantFigures,
    );
  }

  return Number.parseFloat(rounded) > 0 ? rounded : undefined;
}
