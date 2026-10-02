import { BigNumber } from 'bignumber.js';

import {
  LIGHTER_MAX_WIRE_PRICE,
  LIGHTER_MIN_TRADING_API_KEY_INDEX,
  LIGHTER_MAX_TRADING_API_KEY_INDEX,
} from '../constants/lighterConfig.js';
import { PERPS_ERROR_CODES } from '../perpsErrorCodes.js';
import type {
  OrderParams,
  OrderResult,
  ScaleOrderGroup,
} from '../types/index.js';
import type { LighterOrderBookMeta } from '../types/lighter-types.js';
import {
  computeScalePriceLadder,
  splitScaleSizes,
} from './orderCalculations.js';
import { SCALE_ORDER_COUNT } from './orderTypes.js';

const LIGHTER_SCALE_MAX_DECIMALS = 18;
const LIGHTER_SCALE_MAX_JOURNAL_LENGTH = 2_000_000;
const LIGHTER_SCALE_MAX_GROUP_ID_LENGTH = 256;
const LIGHTER_SCALE_MAX_SYMBOL_LENGTH = 100;
const LIGHTER_SCALE_CLIENT_ID_LIMIT = 2 ** 48;
const LIGHTER_SCALE_MAX_HASH_LENGTH = 128;
export const LIGHTER_SCALE_JOURNAL_PREFIX = 'lighterScaleOrders:';

export const LIGHTER_SCALE_PREFIX = 'lighter-scale:';
export const LIGHTER_SCALE_MAX_GROUPS = 64;

export type LighterScaleRung = {
  clientOrderId: number;
  price: string;
  size: string;
  priceInt: number;
  sizeInt: number;
  state:
    | 'prepared'
    | 'unknown'
    | 'submitted'
    | 'accepted'
    | 'resting'
    | 'filled'
    | 'canceled'
    | 'rejected';
  nonAcceptance?: 'failed' | 'expired' | 'nonce-consumed';
  orderExpiry: number | null;
  nonce: number | null;
  txHash: string | null;
  expiresAt: number | null;
  orderId?: string;
  filledSize?: string;
};
export type LighterScaleGroup = {
  version: 1;
  groupId: string;
  symbol: string;
  accountIndex: number;
  apiKeyIndex: number;
  marketId: number;
  isBuy: boolean;
  reduceOnly: boolean;
  createdAt: number;
  walletAddress: string;
  network: 'mainnet' | 'testnet';
  sizeDecimals: number;
  priceDecimals: number;
  placementStopped: boolean;
  rungs: LighterScaleRung[];
};

/** Parse a full positive decimal without binary rounding or numeric prefixes.
 * @param raw - Caller or venue decimal.
 * @returns Exact positive quantity.
 */
export function parseScaleDecimal(raw: unknown): BigNumber {
  if (
    typeof raw !== 'string' ||
    !/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/u.test(raw)
  ) {
    throw new Error('Invalid Lighter Scale decimal');
  }
  const value = new BigNumber(raw);
  if (!value.isFinite() || !value.gt(0)) {
    throw new Error('Lighter Scale values must be positive');
  }
  return value;
}

/** Normalize inclusive ascending prices to the fixed venue grid.
 * @param min - Exact lower price.
 * @param max - Exact upper price.
 * @param count - Number of rungs.
 * @param decimals - Venue price precision.
 * @returns Distinct canonical price strings.
 */
export function normalizeLighterScalePrices(
  min: string,
  max: string,
  count: number,
  decimals: number,
): string[] {
  if (
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > LIGHTER_SCALE_MAX_DECIMALS
  ) {
    throw new Error('Invalid Lighter Scale precision');
  }
  let low: BigNumber;
  let high: BigNumber;
  try {
    low = parseScaleDecimal(min);
    high = parseScaleDecimal(max);
  } catch {
    throw new Error(PERPS_ERROR_CODES.ORDER_SCALE_RANGE_INVALID);
  }
  if (
    !low.shiftedBy(decimals).isInteger() ||
    !high.shiftedBy(decimals).isInteger()
  ) {
    throw new Error(PERPS_ERROR_CODES.ORDER_SCALE_RANGE_INVALID);
  }
  computeScalePriceLadder({
    minPrice: low.toNumber(),
    maxPrice: high.toNumber(),
    count,
  });
  const prices = Array.from({ length: count }, (_, index) =>
    low
      .plus(
        high
          .minus(low)
          .times(index)
          .div(count - 1),
      )
      .decimalPlaces(decimals, BigNumber.ROUND_DOWN),
  );
  const wire = prices.map((price) => price.shiftedBy(decimals));
  if (
    wire.some(
      (price) =>
        !price.isInteger() || price.lt(1) || price.gt(LIGHTER_MAX_WIRE_PRICE),
    ) ||
    new Set(wire.map(String)).size !== count
  ) {
    throw new Error(PERPS_ERROR_CODES.ORDER_SCALE_RANGE_INVALID);
  }
  return prices.map((price) => price.toFixed());
}

/** Build all rungs and prove exact base and quote bounds before any write.
 * @param params - Scale intent.
 * @param market - Active venue metadata.
 * @returns Exact normalized rungs and totals.
 */
export function buildLighterScaleLadder(
  params: Omit<OrderParams, 'size' | 'isBuy'> &
    Partial<Pick<OrderParams, 'size' | 'isBuy'>>,
  market: LighterOrderBookMeta,
): { prices: string[]; sizes: string[]; size: string; notional: string } {
  const unsupported = [
    'price',
    'triggerPrice',
    'timeInForce',
    'takeProfitPrice',
    'stopLossPrice',
    'takeProfitSize',
    'stopLossSize',
    'tpslLinkage',
    'grouping',
    'clientOrderId',
    'twapDuration',
    'twapRandomize',
    'chaseIntervalMs',
    'chaseMaxDurationMs',
    'chaseMaxRepricings',
    'chaseMaxDistanceBps',
    'marginMode',
    'slippage',
    'maxSlippageBps',
    'priceAtCalculation',
    'isFullClose',
  ] as const;
  const field = unsupported.find((key) => params[key] !== undefined);
  if (field) {
    throw new Error(`Lighter Scale does not support ${field}`);
  }
  if (
    market.status !== 'active' ||
    market.marketType !== 'perp' ||
    params.orderType !== 'scale'
  ) {
    throw new Error('Lighter Scale requires an active perpetual market');
  }
  const {
    scaleNumOrders: count,
    scaleMinPrice: min,
    scaleMaxPrice: max,
  } = params;
  if (min === undefined || max === undefined) {
    throw new Error(PERPS_ERROR_CODES.ORDER_SCALE_RANGE_REQUIRED);
  }
  if (count === undefined) {
    throw new Error(PERPS_ERROR_CODES.ORDER_SCALE_COUNT_INVALID);
  }
  const prices = normalizeLighterScalePrices(
    min,
    max,
    count,
    market.supportedPriceDecimals,
  );
  const decimals = market.supportedSizeDecimals;
  if (
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > LIGHTER_SCALE_MAX_DECIMALS
  ) {
    throw new Error('Invalid Lighter Scale precision');
  }
  const budget =
    params.usdAmount === undefined
      ? undefined
      : parseScaleDecimal(params.usdAmount);
  const rawSize = budget
    ? budget.div(prices[0])
    : parseScaleDecimal(params.size);
  const units = rawSize.shiftedBy(decimals).integerValue(BigNumber.ROUND_DOWN);
  if (units.gt(Number.MAX_SAFE_INTEGER) || units.lt(count)) {
    throw new Error(PERPS_ERROR_CODES.ORDER_SCALE_SIZE_TOO_SMALL);
  }
  const split = (total: number): string[] => {
    const sizes = splitScaleSizes({
      totalSize: new BigNumber(total).shiftedBy(-decimals).toNumber(),
      count,
      szDecimals: decimals,
      skew: params.scaleSkew,
    });
    const sum = sizes.reduce(
      (value, size) => value.plus(size),
      new BigNumber(0),
    );
    if (
      !sum.shiftedBy(decimals).eq(total) ||
      sizes.some((size) => !new BigNumber(size).shiftedBy(decimals).isInteger())
    ) {
      throw new Error('Lighter Scale size conservation failed');
    }
    return sizes;
  };
  const quote = (sizes: string[]): BigNumber =>
    sizes.reduce(
      (total, size, index) =>
        total.plus(new BigNumber(size).times(prices[index])),
      new BigNumber(0),
    );
  let total = units.toNumber();
  if (budget) {
    let low = count;
    let high = total;
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
      if (quote(sizes).lte(budget)) {
        feasible = candidate;
        low = candidate + 1;
      } else {
        high = candidate - 1;
      }
    }
    if (feasible === undefined) {
      throw new Error(PERPS_ERROR_CODES.ORDER_SCALE_SIZE_TOO_SMALL);
    }
    total = feasible;
  }
  const sizes = split(total);
  const minimumBase = parseScaleDecimal(market.minBaseAmount);
  const minimumQuote = parseScaleDecimal(market.minQuoteAmount);
  for (const [index, size] of sizes.entries()) {
    if (
      new BigNumber(size).lt(minimumBase) ||
      new BigNumber(size).times(prices[index]).lt(minimumQuote)
    ) {
      throw new Error(PERPS_ERROR_CODES.ORDER_SCALE_SIZE_TOO_SMALL);
    }
  }
  const normalized = new BigNumber(total).shiftedBy(-decimals);
  if (normalized.gt(rawSize) || (budget && quote(sizes).gt(budget))) {
    throw new Error('Lighter Scale exposure exceeds intent');
  }
  return {
    prices,
    sizes,
    size: normalized.toFixed(),
    notional: quote(sizes).toFixed(),
  };
}

/** Whether every leg is proven unable to execute again.
 * @param group - Durable ownership.
 * @returns Terminal status.
 */
export function isLighterScaleTerminal(group: LighterScaleGroup): boolean {
  return (
    group.placementStopped &&
    group.rungs.every((rung) =>
      ['filled', 'canceled', 'rejected', 'prepared'].includes(rung.state),
    )
  );
}

/** Project actual accepted and submitted exposure without invented identities.
 * @param group - Durable ownership.
 * @returns Shared receipt plus durable scope.
 */
export function toLighterScaleGroup(group: LighterScaleGroup): ScaleOrderGroup {
  const submitted = group.rungs.filter((rung) => rung.state !== 'prepared');
  const uncertain = group.rungs.some(
    (rung) => rung.state === 'unknown' || rung.state === 'submitted',
  );
  const accepted = group.rungs.filter((rung) =>
    ['accepted', 'resting', 'filled', 'canceled'].includes(rung.state),
  );
  const total = (rungs: LighterScaleRung[]): BigNumber =>
    rungs.reduce((sum, rung) => sum.plus(rung.size), new BigNumber(0));
  const acceptedSize = total(accepted);
  const acceptedChildren: NonNullable<OrderResult['acceptedChildren']> =
    accepted.map((rung) => {
      if (
        rung.orderId !== undefined &&
        (rung.state === 'resting' ||
          rung.state === 'filled' ||
          rung.state === 'canceled')
      ) {
        return { state: rung.state, orderId: rung.orderId };
      }
      return { state: 'waitingForFill' };
    });
  const fillsKnown =
    !uncertain &&
    accepted.length > 0 &&
    accepted.every((rung) => rung.filledSize !== undefined);
  const filledSize = accepted.reduce(
    (sum, rung) =>
      rung.filledSize === undefined ? sum : sum.plus(rung.filledSize),
    new BigNumber(0),
  );
  let state: ScaleOrderGroup['state'] = 'placing';
  if (group.placementStopped) {
    state = 'stopped';
  }
  if (uncertain) {
    state = 'unknown';
  }
  if (isLighterScaleTerminal(group)) {
    state = 'terminal';
  }
  return {
    groupId: group.groupId,
    orderId: group.groupId,
    symbol: group.symbol,
    providerId: 'lighter',
    accountIndex: group.accountIndex,
    apiKeyIndex: group.apiKeyIndex,
    walletAddress: group.walletAddress,
    network: group.network,
    state,
    submittedSize: total(submitted).toFixed(),
    ...(uncertain ? {} : { acceptedSize: acceptedSize.toFixed() }),
    acceptedChildren,
    childOrderIds: accepted.flatMap((rung) =>
      rung.state === 'resting' && rung.orderId !== undefined
        ? [rung.orderId]
        : [],
    ),
    ...(!uncertain && acceptedSize.gt(0)
      ? {
          weightedAverageLimitPrice: accepted
            .reduce(
              (sum, rung) =>
                sum.plus(new BigNumber(rung.size).times(rung.price)),
              new BigNumber(0),
            )
            .div(acceptedSize)
            .toFixed(),
        }
      : {}),
    ...(fillsKnown ? { filledSize: filledSize.toFixed() } : {}),
  };
}

/** Validate an account journal before using durable financial ownership.
 * @param raw - Serialized journal.
 * @returns Bounded validated groups.
 */
export function parseLighterScaleGroups(
  raw: string | null,
): LighterScaleGroup[] {
  if (raw === null) {
    return [];
  }
  if (raw.length > LIGHTER_SCALE_MAX_JOURNAL_LENGTH) {
    throw new Error('Lighter Scale journal exceeds its storage bound');
  }
  const groups: unknown = JSON.parse(raw);
  if (!Array.isArray(groups) || groups.length > LIGHTER_SCALE_MAX_GROUPS) {
    throw new Error('Invalid Lighter Scale journal');
  }
  const ids = new Set<number>();
  const groupsSeen = new Set<string>();
  const integer = (value: unknown): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  for (const value of groups) {
    const group = value as Partial<LighterScaleGroup>;
    if (
      group?.version !== 1 ||
      typeof group.groupId !== 'string' ||
      !group.groupId.startsWith(LIGHTER_SCALE_PREFIX) ||
      group.groupId.length > LIGHTER_SCALE_MAX_GROUP_ID_LENGTH ||
      groupsSeen.has(group.groupId) ||
      typeof group.symbol !== 'string' ||
      !group.symbol ||
      group.symbol.length > LIGHTER_SCALE_MAX_SYMBOL_LENGTH ||
      !integer(group.accountIndex) ||
      !integer(group.apiKeyIndex) ||
      group.apiKeyIndex < LIGHTER_MIN_TRADING_API_KEY_INDEX ||
      group.apiKeyIndex > LIGHTER_MAX_TRADING_API_KEY_INDEX ||
      !integer(group.marketId) ||
      !integer(group.createdAt) ||
      typeof group.walletAddress !== 'string' ||
      !/^0x[0-9a-f]{40}$/u.test(group.walletAddress) ||
      !['mainnet', 'testnet'].includes(group.network ?? '') ||
      !integer(group.sizeDecimals) ||
      group.sizeDecimals > LIGHTER_SCALE_MAX_DECIMALS ||
      !integer(group.priceDecimals) ||
      group.priceDecimals > LIGHTER_SCALE_MAX_DECIMALS ||
      typeof group.isBuy !== 'boolean' ||
      typeof group.reduceOnly !== 'boolean' ||
      typeof group.placementStopped !== 'boolean' ||
      !Array.isArray(group.rungs) ||
      group.rungs.length < SCALE_ORDER_COUNT.min ||
      group.rungs.length > SCALE_ORDER_COUNT.max
    ) {
      throw new Error('Invalid Lighter Scale group');
    }
    groupsSeen.add(group.groupId);
    let previousPrice = 0;
    const orderIds = new Set<string>();
    for (const rung of group.rungs) {
      if (
        !rung ||
        !integer(rung.clientOrderId) ||
        rung.clientOrderId === 0 ||
        rung.clientOrderId >= LIGHTER_SCALE_CLIENT_ID_LIMIT ||
        ids.has(rung.clientOrderId) ||
        !integer(rung.priceInt) ||
        rung.priceInt < 1 ||
        rung.priceInt > LIGHTER_MAX_WIRE_PRICE ||
        !integer(rung.sizeInt) ||
        rung.sizeInt < 1 ||
        ![
          'prepared',
          'unknown',
          'submitted',
          'accepted',
          'resting',
          'filled',
          'canceled',
          'rejected',
        ].includes(rung.state) ||
        !(rung.nonce === null || integer(rung.nonce)) ||
        !(
          rung.txHash === null ||
          (typeof rung.txHash === 'string' &&
            /^[a-f\d]+$/iu.test(rung.txHash) &&
            rung.txHash.length <= LIGHTER_SCALE_MAX_HASH_LENGTH)
        ) ||
        !(
          rung.expiresAt === null ||
          (integer(rung.expiresAt) && rung.expiresAt > 0)
        ) ||
        (rung.orderId !== undefined && !/^\d{1,20}$/u.test(rung.orderId))
      ) {
        throw new Error('Invalid Lighter Scale rung');
      }
      if (
        !parseScaleDecimal(rung.price)
          .shiftedBy(group.priceDecimals)
          .eq(rung.priceInt) ||
        !parseScaleDecimal(rung.size)
          .shiftedBy(group.sizeDecimals)
          .eq(rung.sizeInt)
      ) {
        throw new Error('Lighter Scale wire quantities differ from intent');
      }
      if (
        rung.priceInt <= previousPrice ||
        (rung.orderId !== undefined && orderIds.has(rung.orderId))
      ) {
        throw new Error(
          'Invalid Lighter Scale ladder ordering or duplicate venue identity',
        );
      }
      previousPrice = rung.priceInt;
      if (rung.orderId !== undefined) {
        orderIds.add(rung.orderId);
      }
      ids.add(rung.clientOrderId);
      if (
        !(
          rung.orderExpiry === null ||
          (integer(rung.orderExpiry) && rung.orderExpiry > 0)
        ) ||
        (rung.state !== 'prepared' && rung.orderExpiry === null)
      ) {
        throw new Error('Invalid Lighter Scale order expiry');
      }
      if (
        rung.nonAcceptance !== undefined &&
        (!['failed', 'expired', 'nonce-consumed'].includes(
          rung.nonAcceptance,
        ) ||
          !['unknown', 'rejected'].includes(rung.state) ||
          rung.orderId !== undefined)
      ) {
        throw new Error('Invalid Lighter Scale non-acceptance proof');
      }
      if (
        rung.state !== 'prepared' &&
        (rung.nonce === null || rung.txHash === null || rung.expiresAt === null)
      ) {
        throw new Error('Invalid Lighter Scale dispatch identity');
      }
      if (
        (rung.state === 'resting' ||
          rung.state === 'filled' ||
          rung.state === 'canceled') &&
        rung.orderId === undefined
      ) {
        throw new Error('Missing Lighter Scale venue identity');
      }
      if (
        rung.filledSize !== undefined &&
        (typeof rung.filledSize !== 'string' ||
          !/^\d+(?:\.\d+)?$/u.test(rung.filledSize) ||
          new BigNumber(rung.filledSize).gt(rung.size))
      ) {
        throw new Error('Invalid Lighter Scale fill');
      }
    }
  }
  return groups as LighterScaleGroup[];
}
