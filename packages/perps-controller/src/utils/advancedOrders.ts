import { BigNumber } from 'bignumber.js';

import { BASIS_POINTS_DIVISOR } from '../constants/hyperLiquidConfig.js';
import {
  CHASE_ORDER_CONFIG,
  CHASE_ORDER_STATUS,
  ORDER_PRICE_WARNING_CONFIG,
} from '../constants/perpsConfig.js';
import { PERPS_ERROR_CODES } from '../perpsErrorCodes.js';
import type {
  ChaseOrder,
  ChaseOrderLists,
  ChaseOrderStatus,
  ChasePlacementCheck,
  PerpsOrderCapabilities,
  PerpsStrategyRules,
  ScaleLadderSizing,
  ScalePriceWarning,
  StrategyOrderType,
  TwapOrder,
  TwapOrderStatus,
  TwapSlicePreview,
} from '../types/index.js';
import { splitScaleSizes } from './orderCalculations.js';

/** Result shape shared with `validateOrderParams`. */
export type AdvancedOrderValidationResult = {
  isValid: boolean;
  error?: string;
};

const SECONDS_PER_MINUTE = 60;
const PERCENT_PER_RATIO = 100;

/**
 * The venue's rules for one strategy on a market, read from the result of
 * `getOrderCapabilities`.
 *
 * @param capabilities - Order capabilities of the market.
 * @param strategy - Strategy whose rules are wanted.
 * @returns The rules, or `undefined` when the market is unavailable, the
 * venue does not run that strategy there, or it does not report the rules.
 */
export function getStrategyRules<Strategy extends StrategyOrderType>(
  capabilities: PerpsOrderCapabilities | undefined,
  strategy: Strategy,
): PerpsStrategyRules[Strategy] | undefined {
  if (
    capabilities?.status !== 'ready' ||
    !capabilities.supportedStrategies.includes(strategy)
  ) {
    return undefined;
  }
  return capabilities.strategyRules?.[strategy];
}

// ---------------------------------------------------------------------------
// TWAP
// ---------------------------------------------------------------------------

/** TWAP statuses that mean the schedule is still executing. */
export const TWAP_ORDER_ACTIVE_STATUSES: readonly TwapOrderStatus[] =
  Object.freeze(['active']);

/**
 * Whether a TWAP schedule is still executing.
 *
 * @param order - TWAP schedule.
 * @returns True for an active schedule; every other status has ended.
 */
export function isTwapOrderActive(order: Pick<TwapOrder, 'status'>): boolean {
  return TWAP_ORDER_ACTIVE_STATUSES.includes(order.status);
}

/**
 * Split TWAP schedules into running and ended ones, keeping their order.
 *
 * @param orders - TWAP schedules.
 * @returns Active and ended schedules.
 */
export function partitionTwapOrders(orders: readonly TwapOrder[]): {
  active: TwapOrder[];
  ended: TwapOrder[];
} {
  const active: TwapOrder[] = [];
  const ended: TwapOrder[] = [];
  for (const order of orders) {
    (isTwapOrderActive(order) ? active : ended).push(order);
  }
  return { active, ended };
}

/**
 * Bound a TWAP's executed size to its schedule and derive what remains.
 *
 * @param totalSize - Schedule size.
 * @param executedSize - Executed size as reported or proven by fills.
 * @returns Executed size within `[0, totalSize]`, the remaining size and the
 * fill progress in basis points (floored; 0 for an empty schedule).
 */
export function boundTwapExecution(
  totalSize: BigNumber,
  executedSize: BigNumber,
): {
  executedSize: BigNumber;
  remainingSize: BigNumber;
  fillProgressBps: number;
} {
  const executed = BigNumber.max(0, BigNumber.min(executedSize, totalSize));
  return {
    executedSize: executed,
    remainingSize: BigNumber.max(totalSize.minus(executed), 0),
    fillProgressBps: totalSize.isGreaterThan(0)
      ? executed
          .dividedBy(totalSize)
          .multipliedBy(BASIS_POINTS_DIVISOR)
          .integerValue(BigNumber.ROUND_FLOOR)
          .toNumber()
      : 0,
  };
}

/**
 * Whether a TWAP record replaces the one held for the same schedule.
 *
 * A venue reports one lifecycle as an activation plus a terminal record, and
 * `lastUpdated` can tie between them (it folds in slice fills both receive) or
 * favor the activation (a read folds fills in milliseconds, a terminal push
 * carries whole seconds). Terminality therefore decides first, since an ended
 * schedule never runs again; otherwise the strictly newer record wins.
 *
 * @param candidate - Record just received.
 * @param existing - Record already held.
 * @returns True when the candidate replaces the held record.
 */
export function supersedesTwapOrder(
  candidate: Pick<TwapOrder, 'status' | 'lastUpdated'>,
  existing: Pick<TwapOrder, 'status' | 'lastUpdated'>,
): boolean {
  const candidateIsTerminal = !isTwapOrderActive(candidate);
  if (candidateIsTerminal !== !isTwapOrderActive(existing)) {
    return candidateIsTerminal;
  }
  return candidate.lastUpdated > existing.lastUpdated;
}

/**
 * Raise a TWAP's execution totals to what its slice fills prove executed.
 *
 * A venue can keep reporting zero executed size while slices fill, so the
 * fills are the fresher record. The totals are only ever raised: fills a read
 * did not page in never lower what the venue already reported.
 *
 * @param order - TWAP schedule with the slice fills known for it.
 * @returns The schedule with totals and progress raised from its fills.
 */
export function reconcileTwapExecution(order: TwapOrder): TwapOrder {
  if (order.fills.length === 0) {
    return order;
  }
  let filledSize = new BigNumber(0);
  let filledNotional = new BigNumber(0);
  for (const fill of order.fills) {
    const size = new BigNumber(fill.size);
    filledSize = filledSize.plus(size);
    filledNotional = filledNotional.plus(size.multipliedBy(fill.price));
  }
  const totalSize = new BigNumber(order.size);
  const reportedSize = new BigNumber(order.executedSize);
  if (
    !filledSize.isFinite() ||
    !filledNotional.isFinite() ||
    !totalSize.isGreaterThan(0) ||
    !filledSize.isGreaterThan(reportedSize.isFinite() ? reportedSize : 0)
  ) {
    return order;
  }

  const { executedSize, remainingSize, fillProgressBps } = boundTwapExecution(
    totalSize,
    filledSize,
  );
  const executedNotional = executedSize.isEqualTo(filledSize)
    ? filledNotional
    : filledNotional.multipliedBy(executedSize).dividedBy(filledSize);
  return {
    ...order,
    executedSize: executedSize.toFixed(),
    remainingSize: remainingSize.toFixed(),
    executedNotional: executedNotional.toFixed(),
    averagePrice: filledNotional.dividedBy(filledSize).toFixed(),
    fillProgressBps,
  };
}

/**
 * Identity of a TWAP schedule across reads and stream pushes.
 *
 * @param order - TWAP schedule.
 * @returns Provider-scoped order key.
 */
export const twapOrderKey = (
  order: Pick<TwapOrder, 'orderId' | 'providerId'>,
): string => `${order.providerId ?? ''}:${order.orderId}`;

/**
 * Merge one TWAP record into the one already held for the same schedule.
 * Fills are united by ID; schedule fields come from the record that
 * supersedes (see `supersedesTwapOrder`), and the totals are then raised from
 * the fills.
 *
 * @param retained - Record already held, if any.
 * @param incoming - Newer record from a read or a stream push.
 * @returns The merged record.
 */
function mergeTwapOrder(
  retained: TwapOrder | undefined,
  incoming: TwapOrder,
): TwapOrder {
  if (!retained) {
    return reconcileTwapExecution(incoming);
  }
  const fills = new Map(retained.fills.map((fill) => [fill.fillId, fill]));
  for (const fill of incoming.fills) {
    fills.set(fill.fillId, fill);
  }
  const schedule = supersedesTwapOrder(incoming, retained)
    ? incoming
    : retained;
  return reconcileTwapExecution({
    ...schedule,
    fills: [...fills.values()].sort(
      (left, right) => left.timestamp - right.timestamp,
    ),
  });
}

/**
 * Merge TWAP records from a read or a stream push into held ones.
 *
 * A record is matched by provider and order ID. Held records missing from
 * `incoming` are kept: a stream carries no fills and caps ended history, so
 * absence there is not proof a schedule is gone.
 *
 * @param retained - Records already held.
 * @param incoming - Records from a read or stream push.
 * @returns Merged records, newest first.
 */
export function mergeTwapOrders(
  retained: readonly TwapOrder[],
  incoming: readonly TwapOrder[],
): TwapOrder[] {
  const merged = new Map(retained.map((order) => [twapOrderKey(order), order]));
  for (const order of incoming) {
    const key = twapOrderKey(order);
    merged.set(key, mergeTwapOrder(merged.get(key), order));
  }
  return [...merged.values()].sort(
    (left, right) => right.startedAt - left.startedAt,
  );
}

/**
 * Check a TWAP draft against the venue's rules.
 *
 * @param params - Draft values and venue rules.
 * @param params.rules - TWAP rules from `getStrategyRules`; absent means the
 * venue does not run TWAP on this market.
 * @param params.durationMinutes - Running time in whole minutes.
 * @param params.usdAmount - Total order value in USD, when known.
 * @returns Validation result with a `PERPS_ERROR_CODES` error.
 */
export function validateTwapOrder(params: {
  rules: PerpsStrategyRules['twap'];
  durationMinutes?: number;
  usdAmount?: string | number;
}): AdvancedOrderValidationResult {
  const { rules, durationMinutes, usdAmount } = params;
  if (!rules) {
    return {
      isValid: false,
      error: PERPS_ERROR_CODES.ORDER_STRATEGY_MARKET_UNSUPPORTED,
    };
  }
  if (durationMinutes === undefined) {
    return {
      isValid: false,
      error: PERPS_ERROR_CODES.ORDER_TWAP_DURATION_REQUIRED,
    };
  }
  if (
    !Number.isInteger(durationMinutes) ||
    durationMinutes < rules.minDurationMinutes ||
    durationMinutes > rules.maxDurationMinutes
  ) {
    return {
      isValid: false,
      error: PERPS_ERROR_CODES.ORDER_TWAP_DURATION_INVALID,
    };
  }
  if (usdAmount !== undefined) {
    const amount = new BigNumber(usdAmount);
    if (!amount.isFinite() || amount.isLessThan(rules.minNotionalUsd)) {
      return {
        isValid: false,
        error: PERPS_ERROR_CODES.ORDER_TWAP_NOTIONAL_TOO_SMALL,
      };
    }
  }
  return { isValid: true };
}

/**
 * Preview how a TWAP is cut into slices on the venue's cadence.
 *
 * The slice size is floored to the venue's size grid, so it is never shown
 * finer than the venue can trade; `isBelowMinimumSize` flags a slice that
 * floors to nothing.
 *
 * @param params - Draft values and venue rules.
 * @param params.rules - TWAP rules from `getStrategyRules`.
 * @param params.durationMinutes - Running time in whole minutes.
 * @param params.size - Total size in base units.
 * @param params.sizeDecimals - Venue size precision of the market.
 * @param params.price - Reference price, to value each slice.
 * @returns The preview, or `undefined` when the rules or inputs are missing.
 */
export function computeTwapSlicePreview(params: {
  rules: PerpsStrategyRules['twap'];
  durationMinutes?: number;
  size?: string | number;
  sizeDecimals: number;
  price?: string | number;
}): TwapSlicePreview | undefined {
  const { rules, durationMinutes, sizeDecimals } = params;
  if (!rules || durationMinutes === undefined) {
    return undefined;
  }
  const sliceCount = Math.floor(
    (durationMinutes * SECONDS_PER_MINUTE) / rules.sliceIntervalSeconds,
  );
  const size = new BigNumber(params.size ?? Number.NaN);
  if (
    !Number.isFinite(sliceCount) ||
    sliceCount < 1 ||
    !size.isFinite() ||
    !size.isGreaterThan(0) ||
    !Number.isInteger(sizeDecimals) ||
    sizeDecimals < 0
  ) {
    return undefined;
  }

  const sizePerSlice = size
    .dividedBy(sliceCount)
    .decimalPlaces(sizeDecimals, BigNumber.ROUND_DOWN);
  const minimumSize = new BigNumber(1).shiftedBy(-sizeDecimals);
  const price = new BigNumber(params.price ?? Number.NaN);
  return {
    sliceCount,
    sliceIntervalSeconds: rules.sliceIntervalSeconds,
    sizePerSlice: sizePerSlice.toFixed(),
    sizeDecimals,
    minimumSize: minimumSize.toFixed(),
    isBelowMinimumSize: sizePerSlice.isLessThan(minimumSize),
    ...(price.isFinite() &&
      price.isGreaterThan(0) && {
        notionalPerSlice: sizePerSlice.multipliedBy(price).toFixed(),
      }),
  };
}

// ---------------------------------------------------------------------------
// Chase
// ---------------------------------------------------------------------------

/**
 * Chase statuses that belong in the running list: still chasing, or waiting
 * for a cancel to settle.
 */
export const CHASE_ORDER_RUNNING_STATUSES: readonly ChaseOrderStatus[] =
  Object.freeze([
    CHASE_ORDER_STATUS.Active,
    CHASE_ORDER_STATUS.TerminationPending,
  ]);

/**
 * Whether a chase belongs in the running list rather than history.
 *
 * @param order - Chase snapshot.
 * @returns True while it chases or its cancel is pending.
 */
export function isChaseOrderRunning(
  order: Pick<ChaseOrder, 'status'>,
): boolean {
  return CHASE_ORDER_RUNNING_STATUSES.includes(order.status);
}

/**
 * Whether cancelling a chase by its handle can still do something: it is
 * running (a pending cancel may be retried), or it stopped with a child order
 * still resting.
 *
 * @param order - Chase snapshot.
 * @returns True when a cancel should be offered.
 */
export function isChaseOrderCancelable(
  order: Pick<ChaseOrder, 'status' | 'restingOrderId'>,
): boolean {
  return isChaseOrderRunning(order) || order.restingOrderId !== null;
}

/**
 * Check whether another chase can be placed under the venue's cap.
 *
 * Only chases that are still chasing take a slot; one waiting on a cancel or
 * stopped by a cap does not, matching what the provider enforces.
 *
 * @param params - Venue rules and current chase snapshots.
 * @param params.rules - Chase rules from `getStrategyRules`.
 * @param params.chaseOrders - Current chase snapshots for the account.
 * @returns Whether a placement fits, with the counts it was judged on.
 */
export function checkChasePlacement(params: {
  rules: PerpsStrategyRules['chase'];
  chaseOrders: readonly Pick<ChaseOrder, 'status'>[];
}): ChasePlacementCheck {
  const { rules, chaseOrders } = params;
  const activeCount = chaseOrders.filter(
    (order) => order.status === CHASE_ORDER_STATUS.Active,
  ).length;
  if (!rules) {
    return {
      canPlace: false,
      activeCount,
      error: PERPS_ERROR_CODES.ORDER_STRATEGY_MARKET_UNSUPPORTED,
    };
  }
  const { maxActiveSessions } = rules;
  if (maxActiveSessions !== undefined && activeCount >= maxActiveSessions) {
    return {
      canPlace: false,
      activeCount,
      maxActiveSessions,
      error: PERPS_ERROR_CODES.ORDER_CHASE_LIMIT_REACHED,
    };
  }
  return {
    canPlace: true,
    activeCount,
    ...(maxActiveSessions !== undefined && { maxActiveSessions }),
  };
}

/**
 * Identity of a chase session across reads.
 *
 * @param order - Chase snapshot.
 * @returns Provider-scoped handle key.
 */
export const chaseOrderKey = (
  order: Pick<ChaseOrder, 'handle' | 'providerId'>,
): string => `${order.providerId ?? ''}:${order.handle}`;

const newestChaseFirst = (left: ChaseOrder, right: ChaseOrder): number =>
  right.startedAt - left.startedAt || left.handle.localeCompare(right.handle);

/**
 * Build running and history chase lists from a fresh read, keeping ended
 * chases a provider has since dropped.
 *
 * A chase that vanishes while running is dropped: without its ending the list
 * would show a guess. History is bounded to the newest `historyLimit` rows.
 *
 * @param params - Previous lists and the latest read.
 * @param params.previous - Lists built from the previous read.
 * @param params.current - Chase snapshots from the latest read.
 * @param params.historyLimit - Most ended chases kept.
 * @returns Running and history lists, newest first.
 */
export function mergeChaseOrderHistory(params: {
  previous?: ChaseOrderLists;
  current: readonly ChaseOrder[];
  historyLimit?: number;
}): ChaseOrderLists {
  const { previous, current } = params;
  const historyLimit = params.historyLimit ?? CHASE_ORDER_CONFIG.HistoryLimit;
  const running: ChaseOrder[] = [];
  const history = new Map<string, ChaseOrder>();
  for (const order of previous?.history ?? []) {
    history.set(chaseOrderKey(order), order);
  }
  for (const order of current) {
    if (isChaseOrderRunning(order)) {
      running.push(order);
    } else {
      history.set(chaseOrderKey(order), order);
    }
  }
  return {
    running: running.sort(newestChaseFirst),
    history: [...history.values()]
      .sort(newestChaseFirst)
      .slice(0, historyLimit),
  };
}

// ---------------------------------------------------------------------------
// Scale
// ---------------------------------------------------------------------------

/**
 * Parse a positive decimal amount exactly.
 *
 * @param raw - Decimal string.
 * @returns The amount.
 * @throws `ORDER_SIZE_POSITIVE` when it is not a positive decimal.
 */
function parsePositiveDecimal(raw: unknown): BigNumber {
  const value =
    typeof raw === 'string' &&
    /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/u.test(raw)
      ? new BigNumber(raw)
      : new BigNumber(Number.NaN);
  if (!value.isFinite() || !value.isGreaterThan(0)) {
    throw new Error(PERPS_ERROR_CODES.ORDER_SIZE_POSITIVE);
  }
  return value;
}

/**
 * Size a scale ladder by the one rule every venue applies: an exact base size
 * is split as given; a USD amount buys the largest size on the venue's grid
 * whose ladder value, rung price times rung size, stays within it.
 *
 * @param params - Normalized ladder prices and the sizing intent.
 * @param params.prices - Venue-normalized rung prices, in ladder order.
 * @param params.sizeDecimals - Venue size precision of the market.
 * @param params.skew - Optional rung-size skew, as `splitScaleSizes` takes it.
 * @param params.size - Exact total base size.
 * @param params.usdAmount - Maximum ladder value in USD.
 * @returns Rung sizes and ladder totals.
 * @throws `ORDER_SIZE_POSITIVE` for a missing or non-positive amount, and
 * `ORDER_SCALE_SIZE_TOO_SMALL` when no rung can get a grid unit.
 */
export function sizeScaleLadder(
  params: {
    prices: readonly string[];
    sizeDecimals: number;
    skew?: number;
  } & (
    | { size: string; usdAmount?: never }
    | { usdAmount: string; size?: never }
  ),
): ScaleLadderSizing {
  const { prices, sizeDecimals: decimals, skew } = params;
  const count = prices.length;
  const budget =
    params.usdAmount === undefined
      ? undefined
      : parsePositiveDecimal(params.usdAmount);
  const lowestPrice = BigNumber.min(...prices.map(parsePositiveDecimal));
  const rawSize = budget
    ? budget.dividedBy(lowestPrice)
    : parsePositiveDecimal(params.size);
  const units = rawSize.shiftedBy(decimals).integerValue(BigNumber.ROUND_DOWN);
  if (units.isGreaterThan(Number.MAX_SAFE_INTEGER) || units.isLessThan(count)) {
    throw new Error(PERPS_ERROR_CODES.ORDER_SCALE_SIZE_TOO_SMALL);
  }

  // `splitScaleSizes` works in floats, so each split is checked to keep every
  // grid unit and stay on the grid before it can be priced or placed.
  const split = (totalUnits: number): string[] => {
    const sizes = splitScaleSizes({
      totalSize: new BigNumber(totalUnits).shiftedBy(-decimals).toNumber(),
      count,
      szDecimals: decimals,
      skew,
    });
    const rungUnits = sizes.map((size) =>
      new BigNumber(size).shiftedBy(decimals),
    );
    if (
      rungUnits.some((unit) => !unit.isInteger()) ||
      !BigNumber.sum(...rungUnits).isEqualTo(totalUnits)
    ) {
      throw new Error('Scale size conservation failed');
    }
    return sizes;
  };
  const value = (sizes: string[]): BigNumber =>
    sizes.reduce(
      (total, size, index) =>
        total.plus(new BigNumber(size).times(prices[index])),
      new BigNumber(0),
    );

  let totalUnits = units.toNumber();
  if (budget) {
    let low = count;
    let high = totalUnits;
    let feasible: number | undefined;
    while (low <= high) {
      const candidate = low + Math.floor((high - low) / 2);
      let sizes: string[];
      try {
        sizes = split(candidate);
      } catch {
        low = candidate + 1;
        continue;
      }
      if (value(sizes).isLessThanOrEqualTo(budget)) {
        feasible = candidate;
        low = candidate + 1;
      } else {
        high = candidate - 1;
      }
    }
    if (feasible === undefined) {
      throw new Error(PERPS_ERROR_CODES.ORDER_SCALE_SIZE_TOO_SMALL);
    }
    totalUnits = feasible;
  }

  const sizes = split(totalUnits);
  const totalSize = new BigNumber(totalUnits).shiftedBy(-decimals);
  const totalNotional = value(sizes);
  if (
    totalSize.isGreaterThan(rawSize) ||
    (budget && totalNotional.isGreaterThan(budget))
  ) {
    throw new Error('Scale exposure exceeds intent');
  }
  return {
    sizes,
    totalSize: totalSize.toFixed(),
    totalNotional: totalNotional.toFixed(),
  };
}

/**
 * Check a scale draft against the venue's rules and, when the venue preview
 * is known, its per-rung minimum.
 *
 * @param params - Draft values, venue rules and the optional venue preview.
 * @param params.rules - Scale rules from `getStrategyRules`.
 * @param params.minPrice - Lowest ladder price.
 * @param params.maxPrice - Highest ladder price.
 * @param params.count - Number of rungs.
 * @param params.skew - Optional rung-size skew.
 * @param params.preview - Ladder prices and sizes from `getScalePriceLadder`,
 * with the venue's per-order minimum value.
 * @returns Validation result with a `PERPS_ERROR_CODES` error.
 */
export function validateScaleOrder(params: {
  rules: PerpsStrategyRules['scale'];
  minPrice?: number;
  maxPrice?: number;
  count?: number;
  skew?: number;
  preview?: Readonly<{
    prices: readonly string[];
    sizes: readonly string[];
    minimumQuoteAmount: string;
  }>;
}): AdvancedOrderValidationResult {
  const { rules, minPrice, maxPrice, count, skew, preview } = params;
  if (!rules) {
    return {
      isValid: false,
      error: PERPS_ERROR_CODES.ORDER_STRATEGY_MARKET_UNSUPPORTED,
    };
  }
  if (minPrice === undefined || maxPrice === undefined) {
    return {
      isValid: false,
      error: PERPS_ERROR_CODES.ORDER_SCALE_RANGE_REQUIRED,
    };
  }
  if (
    !Number.isFinite(minPrice) ||
    !Number.isFinite(maxPrice) ||
    minPrice <= 0 ||
    maxPrice <= minPrice
  ) {
    return {
      isValid: false,
      error: PERPS_ERROR_CODES.ORDER_SCALE_RANGE_INVALID,
    };
  }
  if (
    count === undefined ||
    !Number.isInteger(count) ||
    count < rules.minOrders ||
    count > rules.maxOrders
  ) {
    return {
      isValid: false,
      error: PERPS_ERROR_CODES.ORDER_SCALE_COUNT_INVALID,
    };
  }
  // Omitted is an even ladder, so only a supplied skew is checked.
  if (skew !== undefined && (!Number.isFinite(skew) || skew <= 0)) {
    return {
      isValid: false,
      error: PERPS_ERROR_CODES.ORDER_SCALE_RANGE_INVALID,
    };
  }
  if (preview) {
    // Each rung is its own order, so the venue minimum applies to every rung,
    // not to the ladder's total. An unreadable or mismatched preview fails.
    const minimum = new BigNumber(preview.minimumQuoteAmount);
    const belowMinimum =
      preview.sizes.length !== preview.prices.length ||
      preview.sizes.some(
        (size, index) =>
          !new BigNumber(size)
            .times(preview.prices[index])
            .isGreaterThanOrEqualTo(minimum),
      );
    if (belowMinimum) {
      return {
        isValid: false,
        error: PERPS_ERROR_CODES.ORDER_SCALE_NOTIONAL_TOO_SMALL,
      };
    }
  }
  return { isValid: true };
}

/**
 * Classify scale ladder prices against the book for warnings.
 *
 * - `crosses_market` / `partially_crosses_market`: both or one ladder end is at
 *   or through the opposite touch (best ask for a buy, best bid for a sell),
 *   so those rungs fill at once as taker.
 * - `far_from_market`: the far ladder end sits more than
 *   `ORDER_PRICE_WARNING_CONFIG.FarFromMarketRatio` from the near touch (best
 *   bid for a buy, best ask for a sell); `distancePercent` is that distance,
 *   rounded up to a whole percent.
 *
 * A reduce-only ladder gets no distance warning, since it only closes. Each
 * check is skipped while its touch is unknown.
 *
 * @param params - Ladder prices, side and top of book.
 * @param params.prices - Rung prices (any order).
 * @param params.isBuy - Whether the ladder buys.
 * @param params.bestBid - Best bid price.
 * @param params.bestAsk - Best ask price.
 * @param params.reduceOnly - Whether the ladder only reduces a position.
 * @returns Warnings, empty when there is nothing to warn about.
 */
export function classifyScalePriceWarnings(params: {
  prices: readonly (string | number)[];
  isBuy: boolean;
  bestBid?: string | number;
  bestAsk?: string | number;
  reduceOnly?: boolean;
}): ScalePriceWarning[] {
  const { isBuy } = params;
  const prices = params.prices.map((price) => new BigNumber(price));
  if (
    prices.length === 0 ||
    prices.some((price) => !price.isFinite() || !price.isGreaterThan(0))
  ) {
    return [];
  }
  const touch = (price?: string | number): BigNumber | undefined => {
    const parsed = new BigNumber(price ?? Number.NaN);
    return parsed.isFinite() && parsed.isGreaterThan(0) ? parsed : undefined;
  };
  const oppositeTouch = touch(isBuy ? params.bestAsk : params.bestBid);
  const nearTouch = touch(isBuy ? params.bestBid : params.bestAsk);
  const ends = [BigNumber.min(...prices), BigNumber.max(...prices)];
  const warnings: ScalePriceWarning[] = [];

  if (oppositeTouch) {
    const crossing = ends.filter((price) =>
      isBuy
        ? price.isGreaterThanOrEqualTo(oppositeTouch)
        : price.isLessThanOrEqualTo(oppositeTouch),
    ).length;
    if (crossing === ends.length) {
      warnings.push({ code: 'crosses_market' });
    } else if (crossing > 0) {
      warnings.push({ code: 'partially_crosses_market' });
    }
  }

  if (nearTouch && !params.reduceOnly) {
    const far = isBuy ? ends[0] : ends[1];
    const distance = (
      isBuy ? nearTouch.minus(far) : far.minus(nearTouch)
    ).dividedBy(nearTouch);
    if (distance.isGreaterThan(ORDER_PRICE_WARNING_CONFIG.FarFromMarketRatio)) {
      warnings.push({
        code: 'far_from_market',
        distancePercent: distance
          .times(PERCENT_PER_RATIO)
          .integerValue(BigNumber.ROUND_CEIL)
          .toNumber(),
      });
    }
  }
  return warnings;
}
