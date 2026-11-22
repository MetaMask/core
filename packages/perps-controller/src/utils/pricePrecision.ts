import { BigNumber } from 'bignumber.js';

import type { PerpsPricePrecision } from '../types/index.js';
import {
  countSignificantFigures,
  roundToSignificantFigures,
} from './significantFigures.js';

/**
 * Round a price onto the grid a market accepts, as reported in
 * `PerpsOrderCapabilities.pricePrecision`. A `significant_figures` grid
 * (Hyperliquid) keeps integers as they are, otherwise caps the decimals and
 * then the significant figures, giving the same string as
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
    rounded = new BigNumber(priceNum)
      .dividedBy(tick)
      .integerValue(BigNumber.ROUND_HALF_UP)
      .multipliedBy(tick)
      .toFixed();
  } else if (Number.isInteger(priceNum)) {
    rounded = priceNum.toString();
  } else {
    rounded = Number.parseFloat(
      priceNum.toFixed(pricePrecision.maxDecimals),
    ).toString();
    if (
      countSignificantFigures(rounded) > pricePrecision.maxSignificantFigures
    ) {
      rounded = roundToSignificantFigures(
        rounded,
        pricePrecision.maxSignificantFigures,
      );
    }
  }

  return Number.parseFloat(rounded) > 0 ? rounded : undefined;
}
