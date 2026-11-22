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

const UNKNOWN: OrderBookSlippageEstimate = {
  estimatedSlippageBps: undefined,
  worstSlippageBps: undefined,
  canFill: undefined,
};

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
  const reference = Number(params.referencePrice ?? orderBook.midPrice);
  if (!Number.isFinite(reference) || reference <= 0) {
    return UNKNOWN;
  }
  const target =
    params.size === undefined
      ? (params.sizeUsd ?? Number.NaN) / reference
      : Math.abs(Number(params.size));
  if (!Number.isFinite(target) || target <= 0) {
    return UNKNOWN;
  }

  let filled = 0;
  let weightedPriceSum = 0;
  let worstPrice: number | undefined;
  for (const level of isBuy ? orderBook.asks : orderBook.bids) {
    const price = Number(level.price);
    const size = Number(level.size);
    if (
      !Number.isFinite(price) ||
      !Number.isFinite(size) ||
      price <= 0 ||
      size <= 0
    ) {
      continue;
    }
    worstPrice = price;
    const remaining = target - filled;
    if (remaining <= size) {
      weightedPriceSum += remaining * price;
      filled += remaining;
      break;
    }
    weightedPriceSum += size * price;
    filled += size;
  }

  if (worstPrice === undefined || filled < target) {
    return {
      estimatedSlippageBps: undefined,
      worstSlippageBps: undefined,
      canFill: false,
    };
  }

  const sign = isBuy ? 1 : -1;
  const toBps = (price: number): number =>
    Math.max(
      0,
      ((price - reference) / reference) * BASIS_POINTS_DIVISOR * sign,
    );
  return {
    estimatedSlippageBps: toBps(weightedPriceSum / filled),
    worstSlippageBps: toBps(worstPrice),
    canFill: true,
  };
}
