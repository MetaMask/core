import { BigNumber } from 'bignumber.js';

import { CLOSE_POSITION_CONFIG } from '../constants/perpsConfig.js';
import type { OrderBookData, OrderBookLevel } from '../types/index.js';

/**
 * Group order-book levels into price buckets of `grouping` width. Bids round
 * down to their bucket and asks round up, so a bucket never claims a better
 * price than the orders in it. Bucketing uses exact decimal arithmetic: 100.1
 * at a grouping of 0.1 stays in the 100.1 bucket. Sizes and notionals are
 * summed per bucket and the cumulative totals rebuilt from the best price out.
 * A level with an unreadable price or size is skipped; one with an unreadable
 * notional counts `price * size`.
 *
 * @param levels - Levels for one side, in any order.
 * @param grouping - Bucket width in quote units; a non-positive or
 * non-finite value returns the levels unchanged.
 * @param side - `bid` (best first = highest) or `ask` (best first = lowest).
 * @returns Grouped levels, best price first.
 */
export function aggregateOrderBookLevels(
  levels: readonly OrderBookLevel[],
  grouping: number | string,
  side: 'bid' | 'ask',
): OrderBookLevel[] {
  const step = new BigNumber(grouping);
  if (levels.length === 0 || !step.isFinite() || step.lte(0)) {
    return [...levels];
  }

  const buckets = new Map<
    string,
    { price: BigNumber; size: BigNumber; notional: BigNumber }
  >();

  for (const level of levels) {
    const price = new BigNumber(level.price);
    const size = new BigNumber(level.size);
    if (!price.isFinite() || !size.isFinite()) {
      continue;
    }
    const reportedNotional = new BigNumber(level.notional);
    const notional = reportedNotional.isFinite()
      ? reportedNotional
      : price.multipliedBy(size);
    const gridPrice = price.dividedToIntegerBy(step).multipliedBy(step);
    // Integer division truncates toward zero without rounding away the
    // remainder, even when a price sits just beside an exact grid point.
    let bucketPrice = gridPrice;
    if (side === 'bid' && gridPrice.gt(price)) {
      bucketPrice = gridPrice.minus(step);
    } else if (side === 'ask' && gridPrice.lt(price)) {
      bucketPrice = gridPrice.plus(step);
    }
    const key = bucketPrice.toFixed();
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.size = bucket.size.plus(size);
      bucket.notional = bucket.notional.plus(notional);
    } else {
      buckets.set(key, { price: bucketPrice, size, notional });
    }
  }

  const sorted = [...buckets.values()].sort((left, right) =>
    side === 'bid'
      ? right.price.comparedTo(left.price)
      : left.price.comparedTo(right.price),
  );

  let total = new BigNumber(0);
  let totalNotional = new BigNumber(0);
  return sorted.map((bucket) => {
    total = total.plus(bucket.size);
    totalNotional = totalNotional.plus(bucket.notional);
    return {
      price: bucket.price.toFixed(),
      size: bucket.size.toFixed(),
      total: total.toFixed(),
      notional: bucket.notional.toFixed(CLOSE_POSITION_CONFIG.UsdDecimalPlaces),
      totalNotional: totalNotional.toFixed(
        CLOSE_POSITION_CONFIG.UsdDecimalPlaces,
      ),
    };
  });
}

/** An order book regrouped for display. */
export type GroupedOrderBook = {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  /** Largest cumulative size across both trimmed sides, for depth bars. */
  maxTotal: number;
  /** Largest single-level size across both trimmed sides. */
  maxSize: number;
};

/**
 * Regroup both sides of a book at `grouping` and trim each to `maxLevels`.
 * With a `null` grouping (the stream is already aggregated by the venue) the
 * levels are only trimmed.
 *
 * @param orderBook - Book as delivered by `subscribeToOrderBook`.
 * @param grouping - Bucket width, or `null` to keep the venue's levels.
 * @param maxLevels - Levels kept per side.
 * @returns Trimmed sides plus the depth-bar denominators.
 */
export function groupOrderBook(
  orderBook: Pick<OrderBookData, 'bids' | 'asks'>,
  grouping: number | string | null,
  maxLevels: number,
): GroupedOrderBook {
  const regroup = (
    levels: readonly OrderBookLevel[],
    side: 'bid' | 'ask',
  ): OrderBookLevel[] =>
    (grouping === null
      ? [...levels]
      : aggregateOrderBookLevels(levels, grouping, side)
    ).slice(0, maxLevels);
  const bids = regroup(orderBook.bids, 'bid');
  const asks = regroup(orderBook.asks, 'ask');

  let maxTotal = 0;
  let maxSize = 0;
  for (const level of [...bids, ...asks]) {
    const total = Number.parseFloat(level.total);
    const size = Number.parseFloat(level.size);
    if (Number.isFinite(total) && total > maxTotal) {
      maxTotal = total;
    }
    if (Number.isFinite(size) && size > maxSize) {
      maxSize = size;
    }
  }

  return { bids, asks, maxTotal, maxSize };
}
