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
 * Size a Hyperliquid scale ladder.
 *
 * An exact `size` must sit on the size grid; it is split across the rungs and
 * the returned total is the sum of the rungs, equal to `size`.
 *
 * A `usdAmount` is a target the ladder meets, as Mobile's Pro order form sizes
 * it. The first guess is the amount over the skew-weighted average price,
 * rounded up to the size grid. When that total splits:
 * - it is the result if its rungs reach the target;
 * - otherwise the result is the smallest larger total that reaches it, found
 *   by a doubling then binary search. A candidate that cannot be split counts
 *   as falling short.
 *
 * When the first guess cannot be split (a skewed rung rounds to zero), the
 * result is the smallest smaller total that splits and reaches the target,
 * scanning up from the least total that could reach it. Larger totals are not
 * tried, so the ladder never grows past the first guess; with no such total
 * the sizing fails, as Mobile's does.
 *
 * The notional can exceed `usdAmount`, unlike `sizeScaleLadder`, which keeps
 * a budget as a ceiling. Rung minimums are not checked here; compare each
 * rung's notional with the venue minimum (`validateScaleOrder`).
 *
 * @param params - Sizing parameters.
 * @param params.prices - Rung prices from {@link normalizeHyperLiquidScalePriceLadder}.
 * @param params.sizeDecimals - The market's size decimals.
 * @param params.skew - Rung-size weight of the last rung relative to the
 * first. Defaults to 1 (even).
 * @param params.size - Exact total size in base units, on the size grid.
 * @param params.usdAmount - Target order value in USD.
 * @returns The rung sizes, total size and total notional.
 * @throws `ORDER_SCALE_SIZE_CONSERVATION_FAILED` for an exact size off the
 * size grid; `ORDER_SCALE_SIZE_TOO_SMALL` when no total under these rules
 * reaches the target;
 * and the `splitScaleSizes` errors for an exact size that cannot be split.
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
  const unit = new BigNumber(10).pow(sizeDecimals);
  const toSize = (units: BigNumber): string =>
    units.dividedBy(unit).toFixed(sizeDecimals);

  const split = (totalSize: string): string[] =>
    splitScaleSizes({
      totalSize: Number(totalSize),
      count,
      szDecimals: sizeDecimals,
      skew,
    });
  // A total whose rungs cannot all get a size step has no ladder.
  const trySplit = (totalSize: string): string[] | undefined => {
    try {
      return split(totalSize);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === PERPS_ERROR_CODES.ORDER_SCALE_SIZE_TOO_SMALL
      ) {
        return undefined;
      }
      throw error;
    }
  };
  const value = (sizes: readonly string[]): BigNumber =>
    sizes.reduce(
      (total, size, index) =>
        total.plus(new BigNumber(size).times(prices[index])),
      new BigNumber(0),
    );
  const result = (sizes: string[]): ScaleLadderSizing => ({
    sizes,
    totalSize: BigNumber.sum(...sizes).toFixed(),
    totalNotional: value(sizes).toFixed(),
  });

  if (params.usdAmount === undefined) {
    const total = new BigNumber(params.size);
    if (!total.times(unit).isInteger()) {
      throw new Error(PERPS_ERROR_CODES.ORDER_SCALE_SIZE_CONSERVATION_FAILED);
    }
    return result(split(params.size));
  }

  const target = new BigNumber(params.usdAmount);
  const reaches = (sizes: string[] | undefined): sizes is string[] =>
    sizes !== undefined && value(sizes).gte(target);
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
  const initialSizes = trySplit(initialSize);

  if (initialSizes === undefined) {
    // Below this many units even every rung at the top price falls short.
    const highestPrice = BigNumber.max(...prices);
    const firstGuessUnits = new BigNumber(initialSize).times(unit);
    for (
      let units = BigNumber.max(
        count,
        target
          .dividedBy(highestPrice)
          .times(unit)
          .integerValue(BigNumber.ROUND_CEIL),
      );
      units.lt(firstGuessUnits);
      units = units.plus(1)
    ) {
      const sizes = trySplit(toSize(units));
      if (reaches(sizes)) {
        return result(sizes);
      }
    }
    throw new Error(PERPS_ERROR_CODES.ORDER_SCALE_SIZE_TOO_SMALL);
  }
  if (reaches(initialSizes)) {
    return result(initialSizes);
  }

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
    const sizes = trySplit(toSize(units));
    if (reaches(sizes)) {
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
    const sizes = trySplit(toSize(units));
    if (reaches(sizes)) {
      upper = { units, sizes };
    } else {
      lowerUnits = units;
    }
  }
  return result(upper.sizes);
}
