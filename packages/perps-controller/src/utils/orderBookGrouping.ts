import { BigNumber } from 'bignumber.js';

import {
  CLOSE_POSITION_CONFIG,
  DECIMAL_PRECISION_CONFIG,
  ORDER_BOOK_GROUPING_CONFIG,
} from '../constants/perpsConfig.js';
import type {
  OrderBookData,
  OrderBookLevel,
  SubscribeOrderBookParams,
} from '../types/index.js';

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

/**
 * Grouping widths offered for a book at `midPrice`: a decade four below the
 * price's own, times 1, 2, 5, 10, 100 and 1000. Each width is rounded to
 * `DECIMAL_PRECISION_CONFIG.MaxPriceDecimals` decimals and duplicates are
 * dropped, so float noise never shows as a separate option and no width is
 * finer than the smallest price step a market can quote.
 *
 * @param midPrice - Mid price of the book.
 * @returns Grouping widths, ascending; `ORDER_BOOK_GROUPING_CONFIG.FallbackOptions`
 * when the mid price is not a positive number.
 */
export function calculateOrderBookGroupingOptions(midPrice: number): number[] {
  if (!Number.isFinite(midPrice) || midPrice <= 0) {
    return [...ORDER_BOOK_GROUPING_CONFIG.FallbackOptions];
  }
  const base =
    10 **
    (Math.floor(Math.log10(midPrice)) -
      ORDER_BOOK_GROUPING_CONFIG.DecadeOffset);
  const options = ORDER_BOOK_GROUPING_CONFIG.Multipliers.map((multiplier) =>
    Number(
      (base * multiplier).toFixed(DECIMAL_PRECISION_CONFIG.MaxPriceDecimals),
    ),
  ).filter((option) => option > 0);
  const unique = Array.from(new Set(options));
  return unique.length > 0
    ? unique
    : [10 ** -DECIMAL_PRECISION_CONFIG.MaxPriceDecimals];
}

/**
 * The grouping width a book opens at.
 *
 * @param options - Widths from {@link calculateOrderBookGroupingOptions}.
 * @returns The option at `ORDER_BOOK_GROUPING_CONFIG.DefaultOptionIndex`, else
 * the middle option, or undefined for an empty list.
 */
export function selectDefaultOrderBookGrouping(
  options: readonly number[],
): number | undefined {
  return (
    options[ORDER_BOOK_GROUPING_CONFIG.DefaultOptionIndex] ??
    options[Math.floor(options.length / 2)]
  );
}

/** Book-stream aggregation for a grouping width (`SubscribeOrderBookParams`). */
export type OrderBookAggregationParams = {
  nSigFigs: NonNullable<SubscribeOrderBookParams['nSigFigs']>;
  mantissa?: SubscribeOrderBookParams['mantissa'];
};

/**
 * The `nSigFigs` and `mantissa` to subscribe a book at so the venue already
 * aggregates it at `grouping`. Widths finer than five significant figures of
 * the price use five, with a mantissa of 2 or 5 for widths starting with those
 * digits. These are Hyperliquid's book-stream parameters; on a venue that
 * streams raw levels, group client-side with {@link groupOrderBook} instead.
 *
 * @param grouping - Grouping width in quote units.
 * @param price - Reference price, usually the mid.
 * @returns The aggregation; five significant figures when either input is not
 * a positive number.
 */
export function calculateOrderBookAggregationParams(
  grouping: number,
  price: number,
): OrderBookAggregationParams {
  const { MinSignificantFigures, MaxSignificantFigures } =
    ORDER_BOOK_GROUPING_CONFIG;
  if (
    !Number.isFinite(price) ||
    !Number.isFinite(grouping) ||
    price <= 0 ||
    grouping <= 0
  ) {
    return { nSigFigs: MaxSignificantFigures };
  }
  const groupingMagnitude = Math.floor(Math.log10(grouping));
  const significantFigures =
    Math.floor(Math.log10(price)) - groupingMagnitude + 1;
  if (significantFigures >= MaxSignificantFigures) {
    const firstDigit = Math.floor(grouping / 10 ** groupingMagnitude);
    if (firstDigit <= 1) {
      return { nSigFigs: MaxSignificantFigures };
    }
    return {
      nSigFigs: MaxSignificantFigures,
      mantissa: firstDigit <= 2 ? 2 : 5,
    };
  }
  return {
    nSigFigs: Math.max(
      MinSignificantFigures,
      significantFigures,
    ) as OrderBookAggregationParams['nSigFigs'],
  };
}

/** Top-of-book spread from {@link calculateOrderBookSpread}. */
export type OrderBookSpread = {
  /** Best ask minus best bid, in quote units. */
  spread: number;
  /** Midpoint of the best bid and ask. */
  midPrice: number;
  /** Spread as a percent of the mid price (0.2 = 0.2%). */
  spreadPercentage: number;
};

/**
 * Spread, mid price and spread percent from the best bid and ask, in exact
 * decimal arithmetic.
 *
 * @param params - Top of book.
 * @param params.bestBid - Best bid price.
 * @param params.bestAsk - Best ask price.
 * @returns The spread, or undefined when either side is missing or not a
 * positive number.
 */
export function calculateOrderBookSpread(params: {
  bestBid: number | string | undefined;
  bestAsk: number | string | undefined;
}): OrderBookSpread | undefined {
  const bid = new BigNumber(params.bestBid ?? Number.NaN);
  const ask = new BigNumber(params.bestAsk ?? Number.NaN);
  if (!bid.isFinite() || !ask.isFinite() || bid.lte(0) || ask.lte(0)) {
    return undefined;
  }
  const spread = ask.minus(bid);
  const midPrice = ask.plus(bid).dividedBy(2);
  return {
    spread: spread.toNumber(),
    midPrice: midPrice.toNumber(),
    spreadPercentage: spread.dividedBy(midPrice).multipliedBy(100).toNumber(),
  };
}
