import { BigNumber } from 'bignumber.js';

import type {
  LighterApiOrder,
  LighterOrderBookOrdersResponse,
  LighterRestTrade,
} from '../types/lighter-types.js';
import { adaptFillFromLighterTrade } from './lighterAdapter.js';

/** Authoritative observation of one exact ordinary post-only child. */
export type LighterChaseChildObservation = {
  orderId: string;
  terminal: boolean;
  filledSize: string;
  filledNotional: string;
  remainingSize: string;
};

/**
 * @param value - Wire decimal amount.
 * @returns Nonnegative exact decimal or an explicit integrity error.
 */
function amount(value: string | undefined): BigNumber {
  if (value === undefined || !/^\d+(?:\.\d+)?$/u.test(value)) {
    throw new Error('Lighter Chase amount is missing or malformed');
  }
  const parsed = new BigNumber(value);
  if (!parsed.isFinite() || parsed.isNegative()) {
    throw new Error('Lighter Chase amount is invalid');
  }
  return parsed;
}

/**
 * @param numeric - Numeric native ID (must be lossless).
 * @param exact - Optional canonical string representation.
 * @returns Exact safe native ID.
 */
function exactId(numeric: number, exact?: string): string {
  if (
    !Number.isSafeInteger(numeric) ||
    numeric <= 0 ||
    (exact !== undefined && exact !== String(numeric))
  ) {
    throw new Error('Lighter Chase identity is invalid');
  }
  return String(numeric);
}

/**
 * Quote on the native fixed tick grid after excluding every account-owned row.
 * The public endpoint supplies individual orders, so subtraction is exact and
 * includes other sessions and ordinary resting orders on the same side.
 *
 * @param book - Fresh validated native public book response.
 * @param options - Native grid, side and account identity.
 * @param options.isBuy - Requested side.
 * @param options.accountIndex - Account whose own orders must be removed.
 * @param options.priceDecimals - Fixed native price precision.
 * @returns Noncrossing limit price with no floating-point rounding.
 */
export function readLighterChaseQuote(
  book: LighterOrderBookOrdersResponse,
  options: { isBuy: boolean; accountIndex: number; priceDecimals: number },
): string {
  if (
    !Number.isSafeInteger(options.priceDecimals) ||
    options.priceDecimals < 0 ||
    options.priceDecimals > 18
  ) {
    throw new Error('Lighter Chase book grid is invalid');
  }
  const seen = new Set<string>();
  const external: { bids: BigNumber[]; asks: BigNumber[] } = {
    bids: [],
    asks: [],
  };
  for (const side of ['bids', 'asks'] as const) {
    const rows = book[side];
    const total = side === 'bids' ? book.totalBids : book.totalAsks;
    if (
      !Number.isSafeInteger(total) ||
      total < rows.length ||
      (total > 0 && rows.length === 0)
    ) {
      throw new Error('Lighter Chase book is incomplete');
    }
    for (const row of rows) {
      const id = exactId(row.orderIndex, row.orderId);
      if (
        seen.has(id) ||
        !Number.isSafeInteger(row.ownerAccountIndex) ||
        row.ownerAccountIndex < 0
      ) {
        throw new Error('Lighter Chase book identity is ambiguous');
      }
      seen.add(id);
      const price = amount(row.price);
      const size = amount(row.remainingBaseAmount);
      const units = price.shiftedBy(options.priceDecimals);
      if (
        !units.isInteger() ||
        units.lt(1) ||
        units.gt('4294967295') ||
        size.lte(0) ||
        size.gt(amount(row.initialBaseAmount))
      ) {
        throw new Error('Lighter Chase book level is invalid');
      }
      if (
        row.ownerAccountIndex !== options.accountIndex ||
        (side === 'bids') !== options.isBuy
      ) {
        external[side].push(price);
      }
    }
  }
  if (external.bids.length === 0 || external.asks.length === 0) {
    throw new Error('Lighter Chase external book is unavailable');
  }
  const bid = BigNumber.maximum(...external.bids);
  const ask = BigNumber.minimum(...external.asks);
  if (bid.gte(ask)) {
    throw new Error('Lighter Chase book is crossed');
  }
  const tick = new BigNumber(1).shiftedBy(-options.priceDecimals);
  const price = options.isBuy
    ? BigNumber.minimum(bid.plus(tick), ask.minus(tick))
    : BigNumber.maximum(ask.minus(tick), bid.plus(tick));
  if (price.lte(0)) {
    throw new Error('Lighter Chase book quote is invalid');
  }
  return price.toFixed();
}

/**
 * Correlate exact native child identity and exhaustive individual fill history.
 * Callers must reread the exact child after collecting trades to reject races.
 *
 * @param intent - Immutable session ownership and market intent.
 * @param child - Exact persisted child and signed nonce.
 * @param order - Stable authoritative order snapshot.
 * @param trades - Fully paginated unaggregated trades for this exact child.
 * @returns Exact cumulative fills and terminal state, never invented zero fills.
 */
export function reconcileLighterChaseChild(
  intent: {
    owner: { accountIndex: number };
    symbol: string;
    marketId: number;
    isBuy: boolean;
    reduceOnly: boolean;
  },
  child: { clientOrderId: string; size: string; price: string; nonce?: number },
  order: LighterApiOrder,
  trades: readonly LighterRestTrade[],
): LighterChaseChildObservation {
  const orderId = identifyLighterChaseChild(intent, child, order);
  const unique = new Map<string, LighterRestTrade>();
  let filled = new BigNumber(0);
  let notional = new BigNumber(0);
  for (const trade of trades) {
    exactId(trade.bidId, trade.bidIdStr);
    exactId(trade.askId, trade.askIdStr);
    const id = exactId(trade.tradeId, trade.tradeIdStr);
    const previous = unique.get(id);
    if (previous) {
      if (JSON.stringify(previous) !== JSON.stringify(trade)) {
        throw new Error('Lighter Chase conflicting duplicate fill');
      }
      continue;
    }
    if (
      exactId(intent.isBuy ? trade.bidId : trade.askId) !== orderId ||
      (intent.isBuy ? trade.bidAccountId : trade.askAccountId) !==
        intent.owner.accountIndex ||
      trade.marketId !== intent.marketId ||
      !trade.txHash ||
      !Number.isSafeInteger(trade.timestamp) ||
      trade.timestamp <= 0
    ) {
      throw new Error('Lighter Chase fill identity mismatch');
    }
    adaptFillFromLighterTrade(trade, intent.symbol, intent.owner.accountIndex);
    unique.set(id, trade);
    filled = filled.plus(amount(trade.size));
    notional = notional.plus(amount(trade.usdAmount));
  }
  if (
    !filled.eq(amount(order.filledBaseAmount)) ||
    !notional.eq(amount(order.filledQuoteAmount)) ||
    filled.gt(child.size)
  ) {
    throw new Error('Lighter Chase fill totals are incomplete or inconsistent');
  }
  const remaining = new BigNumber(child.size).minus(filled);
  const active = ['pending', 'in-progress', 'open'].includes(order.status);
  const terminal = [
    'filled',
    'canceled',
    'canceled-post-only',
    'canceled-reduce-only',
    'canceled-position-not-allowed',
    'canceled-margin-not-allowed',
    'canceled-self-trade',
    'canceled-expired',
    'canceled-liquidation',
    'canceled-invalid-balance',
  ].includes(order.status);
  if (!active && !terminal) {
    throw new Error('Lighter Chase child status is unverified');
  }
  if (order.status === 'filled' && !remaining.isZero()) {
    throw new Error('Lighter Chase filled child is underfilled');
  }
  const rawRemaining = amount(order.remainingBaseAmount);
  if (rawRemaining.gt(remaining) || (active && !rawRemaining.eq(remaining))) {
    throw new Error('Lighter Chase remaining quantity is inconsistent');
  }
  return {
    orderId,
    terminal,
    filledSize: filled.toFixed(),
    filledNotional: notional.toFixed(),
    remainingSize: remaining.toFixed(),
  };
}

/**
 * Validate exact immutable child ownership independently of execution reads.
 *
 * @param intent - Immutable session ownership.
 * @param child - Persisted signed child.
 * @param order - Exact client-ID venue lookup.
 * @returns The exact venue order ID eligible for cancellation.
 */
export function identifyLighterChaseChild(
  intent: {
    owner: { accountIndex: number };
    symbol: string;
    marketId: number;
    isBuy: boolean;
    reduceOnly: boolean;
  },
  child: { clientOrderId: string; size: string; price: string; nonce?: number },
  order: LighterApiOrder,
): string {
  const orderId = exactId(order.orderIndex, order.orderId);
  if (
    exactId(order.clientOrderIndex, order.clientOrderId) !==
      child.clientOrderId ||
    order.ownerAccountIndex !== intent.owner.accountIndex ||
    order.marketIndex !== intent.marketId ||
    order.isAsk === intent.isBuy ||
    order.type !== 'limit' ||
    order.timeInForce !== 'post-only' ||
    Boolean(order.reduceOnly) !== intent.reduceOnly ||
    child.nonce === undefined ||
    order.nonce !== child.nonce ||
    !amount(order.initialBaseAmount).eq(child.size) ||
    !amount(order.price).eq(child.price)
  ) {
    throw new Error('Lighter Chase child identity mismatch');
  }
  return orderId;
}
