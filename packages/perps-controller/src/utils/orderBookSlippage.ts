import { BigNumber } from 'bignumber.js';

import { BASIS_POINTS_DIVISOR } from '../constants/hyperLiquidConfig.js';
import type { OrderBookData } from '../types/index.js';

/** Inputs to {@link estimateOrderBookSlippage}. */
export type OrderBookSlippageParams = {
  /** Book to sweep, as delivered by `subscribeToOrderBook`. */
  orderBook: Pick<OrderBookData, 'bids' | 'asks' | 'midPrice'>;
  /** A buy sweeps the asks, a sell the bids. */
  isBuy: boolean;
  /** Order size in base units. Takes precedence over `sizeUsd`. */
  size?: number | string;
  /** Order value in USD, converted to a size at the reference price. */
  sizeUsd?: number;
  /** Price slippage is measured from. Defaults to the book's mid price. */
  referencePrice?: number | string;
};

/** Result of {@link estimateOrderBookSlippage}. Undefined fields are unknown. */
export type OrderBookSlippageEstimate = {
  /** Average fill price's distance from the reference price, in basis points. */
  estimatedSlippageBps: number | undefined;
  /** Last level the order reaches, as distance from the reference, in basis points. */
  worstSlippageBps: number | undefined;
  /**
   * Whether the visible book holds the whole order. Depth only: to check a
   * max-slippage cap, compare `worstSlippageBps` with it.
   */
  canFill: boolean | undefined;
};

function unknownEstimate(): OrderBookSlippageEstimate {
  return {
    estimatedSlippageBps: undefined,
    worstSlippageBps: undefined,
    canFill: undefined,
  };
}

/**
 * Slippage a market order would take by sweeping the visible book: the
 * volume-weighted fill price and the last level reached, each measured from
 * the reference price in basis points against the order's side and floored at
 * zero.
 *
 * @param params - See {@link OrderBookSlippageParams}.
 * @returns The estimate. `canFill` is false, with both slippages undefined,
 * when the visible levels cannot hold the order; every field is undefined
 * when the size or reference price is missing or not a positive number.
 */
export function estimateOrderBookSlippage(
  params: OrderBookSlippageParams,
): OrderBookSlippageEstimate {
  const { orderBook, isBuy } = params;
  const reference = new BigNumber(params.referencePrice ?? orderBook.midPrice);
  if (!reference.isFinite() || reference.lte(0)) {
    return unknownEstimate();
  }
  const target =
    params.size === undefined
      ? new BigNumber(params.sizeUsd ?? Number.NaN).dividedBy(reference)
      : new BigNumber(params.size).abs();
  if (!target.isFinite() || target.lte(0)) {
    return unknownEstimate();
  }

  // Exact decimals: binary floats leave 0.3 + 0.6 just short of 0.9.
  let filled = new BigNumber(0);
  let weightedPriceSum = new BigNumber(0);
  let worstPrice: BigNumber | undefined;
  for (const level of isBuy ? orderBook.asks : orderBook.bids) {
    const price = new BigNumber(level.price);
    const size = new BigNumber(level.size);
    if (!price.isFinite() || !size.isFinite() || price.lte(0) || size.lte(0)) {
      continue;
    }
    worstPrice = price;
    const remaining = target.minus(filled);
    if (remaining.lte(size)) {
      weightedPriceSum = weightedPriceSum.plus(remaining.multipliedBy(price));
      filled = target;
      break;
    }
    weightedPriceSum = weightedPriceSum.plus(size.multipliedBy(price));
    filled = filled.plus(size);
  }

  if (worstPrice === undefined || filled.lt(target)) {
    return {
      estimatedSlippageBps: undefined,
      worstSlippageBps: undefined,
      canFill: false,
    };
  }

  const sign = isBuy ? 1 : -1;
  const toBps = (price: BigNumber): number =>
    Math.max(
      0,
      price
        .minus(reference)
        .dividedBy(reference)
        .multipliedBy(BASIS_POINTS_DIVISOR * sign)
        .toNumber(),
    );
  return {
    estimatedSlippageBps: toBps(weightedPriceSum.dividedBy(filled)),
    worstSlippageBps: toBps(worstPrice),
    canFill: true,
  };
}
