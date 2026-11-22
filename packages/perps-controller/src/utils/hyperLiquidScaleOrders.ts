import { BigNumber } from 'bignumber.js';

import { PERPS_ERROR_CODES } from '../perpsErrorCodes.js';
import type { ScaleLadderSizing } from '../types/index.js';
import { formatHyperLiquidPrice } from './hyperLiquidAdapter.js';
import {
  computeScalePriceLadder,
  splitScaleSizes,
} from './orderCalculations.js';

/**
 * Steps each search stage may take: a binary search over the safe-integer
 * range of size units needs at most 53 halvings.
 */
const SIZE_SEARCH_MAX_STEPS = Math.ceil(Math.log2(Number.MAX_SAFE_INTEGER));

/**
 * Scale ladder prices on Hyperliquid's price grid: the evenly spaced ladder
 * from `computeScalePriceLadder`, each rung rounded with
 * `formatHyperLiquidPrice`.
 *
 * @param params - Ladder parameters.
 * @param params.minPrice - Lowest raw price.
 * @param params.maxPrice - Highest raw price.
 * @param params.count - Number of rungs.
 * @param params.szDecimals - The market's size decimals, which set its price grid.
 * @returns The rung prices, ascending.
 * @throws `ORDER_SCALE_RANGE_INVALID` when two rungs round to the same price,
 * and the `computeScalePriceLadder` errors for an invalid count or range.
 */
export function normalizeHyperLiquidScalePriceLadder(params: {
  minPrice: number;
  maxPrice: number;
  count: number;
  szDecimals: number;
}): string[] {
  const { szDecimals, ...ladderParams } = params;
  const prices = computeScalePriceLadder(ladderParams).map((price) =>
    formatHyperLiquidPrice({ price, szDecimals }),
  );
  if (new Set(prices).size !== prices.length) {
    throw new Error(PERPS_ERROR_CODES.ORDER_SCALE_RANGE_INVALID);
  }
  return prices;
}

/**
 * Size a Hyperliquid scale ladder. An exact `size` is split across the rungs
 * as given. A `usdAmount` is a target the ladder meets: the first guess is the
 * amount over the skew-weighted average price, rounded up to the size grid;
 * when the split rungs fall short of the target, the smallest larger total
 * that reaches it is found by search. The result can exceed `usdAmount` by
 * up to the rounding of one search step, unlike `sizeScaleLadder`, which keeps
 * a budget as a ceiling.
 *
 * Rung minimums are not checked here; compare each rung's notional with the
 * venue minimum (`validateScaleOrder`).
 *
 * @param params - Sizing parameters.
 * @param params.prices - Rung prices from {@link normalizeHyperLiquidScalePriceLadder}.
 * @param params.sizeDecimals - The market's size decimals.
 * @param params.skew - Rung-size weight of the last rung relative to the
 * first. Defaults to 1 (even).
 * @param params.size - Exact total size in base units.
 * @param params.usdAmount - Target order value in USD.
 * @returns The rung sizes, total size and total notional.
 * @throws `ORDER_SCALE_SIZE_TOO_SMALL` when no total within the search reaches
 * the target, and the `splitScaleSizes` errors for an unsplittable total.
 */
export function sizeHyperLiquidScaleLadder(
  params: {
    prices: readonly string[];
    sizeDecimals: number;
    skew?: number;
  } & (
    | { size: string; usdAmount?: never }
    | { usdAmount: string; size?: never }
  ),
): ScaleLadderSizing {
  const { prices, sizeDecimals, skew = 1 } = params;
  const count = prices.length;

  const split = (totalSize: string): string[] =>
    splitScaleSizes({
      totalSize: Number(totalSize),
      count,
      szDecimals: sizeDecimals,
      skew,
    });
  const value = (sizes: readonly string[]): BigNumber =>
    sizes.reduce(
      (total, size, index) =>
        total.plus(new BigNumber(size).times(prices[index])),
      new BigNumber(0),
    );

  if (params.usdAmount === undefined) {
    const sizes = split(params.size);
    return {
      sizes,
      totalSize: new BigNumber(params.size).toFixed(),
      totalNotional: value(sizes).toFixed(),
    };
  }

  const target = new BigNumber(params.usdAmount);
  const weights = prices.map(
    (_price, index) => 1 + ((skew - 1) * index) / (count - 1),
  );
  const weightTotal = BigNumber.sum(...weights);
  const weightedAveragePrice = prices
    .reduce(
      (total, price, index) =>
        total.plus(new BigNumber(price).times(weights[index])),
      new BigNumber(0),
    )
    .dividedBy(weightTotal);
  const initialSize = target
    .dividedBy(weightedAveragePrice)
    .decimalPlaces(sizeDecimals, BigNumber.ROUND_CEIL)
    .toFixed(sizeDecimals);

  let best = { totalSize: initialSize, sizes: split(initialSize) };
  if (value(best.sizes).lt(target)) {
    const unit = new BigNumber(10).pow(sizeDecimals);
    const toSize = (units: BigNumber): string =>
      units.dividedBy(unit).toFixed(sizeDecimals);
    const initialUnits = new BigNumber(initialSize)
      .times(unit)
      .integerValue(BigNumber.ROUND_HALF_UP);
    let lowerUnits = initialUnits;
    let upper: { units: BigNumber; sizes: string[] } | undefined;

    // Bracket a total that reaches the target in doubling steps, so a steep
    // skew does not walk one size step at a time.
    let step = new BigNumber(1);
    for (let attempt = 0; attempt < SIZE_SEARCH_MAX_STEPS; attempt += 1) {
      const units = initialUnits.plus(step);
      if (units.gt(Number.MAX_SAFE_INTEGER)) {
        break;
      }
      const sizes = split(toSize(units));
      if (value(sizes).gte(target)) {
        upper = { units, sizes };
        break;
      }
      lowerUnits = units;
      step = step.times(2);
    }
    if (upper === undefined) {
      throw new Error(PERPS_ERROR_CODES.ORDER_SCALE_SIZE_TOO_SMALL);
    }

    // Narrow the bracket to the smallest total that reaches the target.
    for (
      let attempt = 0;
      attempt < SIZE_SEARCH_MAX_STEPS && upper.units.minus(lowerUnits).gt(1);
      attempt += 1
    ) {
      const units = lowerUnits
        .plus(upper.units)
        .dividedBy(2)
        .integerValue(BigNumber.ROUND_FLOOR);
      const sizes = split(toSize(units));
      if (value(sizes).gte(target)) {
        upper = { units, sizes };
      } else {
        lowerUnits = units;
      }
    }
    best = { totalSize: toSize(upper.units), sizes: upper.sizes };
  }

  return {
    sizes: best.sizes,
    totalSize: new BigNumber(best.totalSize).toFixed(),
    totalNotional: value(best.sizes).toFixed(),
  };
}
