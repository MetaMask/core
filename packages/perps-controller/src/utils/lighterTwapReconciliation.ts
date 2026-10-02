import { BigNumber } from 'bignumber.js';

import type { LighterTwapRecord } from '../services/LighterTwapService.js';
import type {
  TwapOrder,
  TwapOrderFill,
  TwapOrderStatus,
} from '../types/index.js';
import type {
  LighterApiOrder,
  LighterRestTrade,
} from '../types/lighter-types.js';
import { adaptFillFromLighterTrade } from './lighterAdapter.js';

export type LighterTwapObservation = {
  clientOrderId: string;
  parentOrderId: string;
  parent: LighterApiOrder;
  children: LighterApiOrder[];
  trades: LighterRestTrade[];
  order: TwapOrder;
  /** Observation only until venue mapping and cancellation-race proof pass. */
  terminalObserved: boolean;
};

/**
 * @param numeric - JSON numeric ID, accepted only when lossless.
 * @param exact - Optional exact string ID.
 * @returns A canonical exact ID.
 */
function exactId(numeric: number, exact?: string): string {
  if (
    !Number.isSafeInteger(numeric) ||
    numeric < 0 ||
    (exact !== undefined && exact !== String(numeric))
  ) {
    throw new Error('Lighter TWAP order identity is unsafe or inconsistent');
  }
  return String(numeric);
}

/**
 * @param value - Required venue decimal amount.
 * @returns A validated nonnegative exact decimal.
 */
function amount(value: string | undefined): BigNumber {
  if (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/u.test(value)) {
    throw new Error('Lighter TWAP execution amount is missing or malformed');
  }
  return new BigNumber(value);
}

/**
 * Build an observational snapshot from complete parent/child and trade reads.
 * Callers must exhaust pagination and fence concurrent parent changes first.
 * Terminal observations are not authorization to clear durable obligations;
 * rollout must establish venue status and cancel-race semantics separately.
 *
 * @param record - Immutable owned schedule and signed placement identity.
 * @param rows - Complete relevant active/inactive order rows.
 * @param trades - Complete unaggregated trades for exact child IDs.
 * @param observedAt - Millisecond collection time.
 * @returns Reconciled totals, exact fills and observed native parent state.
 */
export function reconcileLighterTwapObservation(
  record: LighterTwapRecord,
  rows: LighterApiOrder[],
  trades: LighterRestTrade[],
  observedAt: number,
): LighterTwapObservation {
  const { intent } = record;
  const parents = rows.filter(
    (row) =>
      exactId(row.clientOrderIndex, row.clientOrderId) === intent.clientOrderId,
  );
  if (parents.length !== 1) {
    throw new Error('Lighter TWAP exact parent is missing or ambiguous');
  }
  const parent = parents[0];
  const parentOrderId = exactId(parent.orderIndex, parent.orderId);
  if (
    !Number.isSafeInteger(record.placement.nonce) ||
    parent.type !== 'twap' ||
    parent.ownerAccountIndex !== intent.owner.accountIndex ||
    parent.marketIndex !== intent.marketId ||
    parent.isAsk === intent.isBuy ||
    Boolean(parent.reduceOnly) !== intent.reduceOnly ||
    (parent.reduceOnly !== true &&
      parent.reduceOnly !== false &&
      parent.reduceOnly !== 0 &&
      parent.reduceOnly !== 1) ||
    parent.timeInForce !== 'good-till-time' ||
    parent.orderExpiry !== intent.orderExpiry ||
    parent.nonce !== record.placement.nonce ||
    !amount(parent.initialBaseAmount).eq(intent.size) ||
    !amount(parent.price).eq(intent.price) ||
    (record.parentOrderId !== undefined &&
      record.parentOrderId !== parentOrderId)
  ) {
    throw new Error(
      'Lighter TWAP parent does not match immutable signed intent',
    );
  }
  const children: LighterApiOrder[] = [];
  const childIds = new Set<string>();
  for (const row of rows) {
    if (row === parent) {
      continue;
    }
    const stringLink = row.parentOrderId;
    const numericLink = row.parentOrderIndex;
    const linked =
      stringLink === parentOrderId || numericLink === parent.orderIndex;
    if (!linked) {
      continue;
    }
    if (
      stringLink !== parentOrderId ||
      numericLink !== parent.orderIndex ||
      row.type !== 'twap-sub' ||
      row.ownerAccountIndex !== intent.owner.accountIndex ||
      row.marketIndex !== intent.marketId ||
      row.isAsk === intent.isBuy
    ) {
      throw new Error(
        'Lighter TWAP child parent linkage or ownership mismatch',
      );
    }
    const id = exactId(row.orderIndex, row.orderId);
    if (childIds.has(id)) {
      throw new Error('Lighter TWAP child identity is ambiguous');
    }
    childIds.add(id);
    children.push(row);
  }
  const uniqueTrades = new Map<string, LighterRestTrade>();
  const fills: TwapOrderFill[] = [];
  const totals = new Map<string, { base: BigNumber; quote: BigNumber }>();
  for (const trade of trades) {
    const sideId = intent.isBuy ? trade.bidId : trade.askId;
    const sideOwner = intent.isBuy ? trade.bidAccountId : trade.askAccountId;
    if (
      !childIds.has(exactId(sideId)) ||
      sideOwner !== intent.owner.accountIndex ||
      trade.marketId !== intent.marketId
    ) {
      throw new Error('Lighter TWAP trade is not owned by an exact child');
    }
    const id = exactId(trade.tradeId);
    const previous = uniqueTrades.get(id);
    if (previous) {
      if (JSON.stringify(previous) !== JSON.stringify(trade)) {
        throw new Error('Lighter TWAP conflicting duplicate trade');
      }
      continue;
    }
    if (
      !trade.txHash ||
      !Number.isSafeInteger(trade.timestamp) ||
      trade.timestamp < intent.startedAt
    ) {
      throw new Error(
        'Lighter TWAP trade provenance is missing or predates intent',
      );
    }
    uniqueTrades.set(id, trade);
    const adapted = adaptFillFromLighterTrade(
      trade,
      intent.symbol,
      intent.owner.accountIndex,
    );
    const fill: TwapOrderFill = {
      fillId: id,
      orderId: String(sideId),
      side: intent.isBuy ? 'buy' : 'sell',
      price: trade.price,
      size: trade.size,
      fee: adapted.fee,
      feeToken: adapted.feeToken,
      timestamp: trade.timestamp,
      transactionHash: trade.txHash,
    };
    fills.push(fill);
    const sum = totals.get(String(sideId)) ?? {
      base: new BigNumber(0),
      quote: new BigNumber(0),
    };
    sum.base = sum.base.plus(amount(trade.size));
    sum.quote = sum.quote.plus(amount(trade.usdAmount));
    totals.set(String(sideId), sum);
  }
  let executed = new BigNumber(0);
  let notional = new BigNumber(0);
  for (const child of children) {
    const sum = totals.get(String(child.orderIndex)) ?? {
      base: new BigNumber(0),
      quote: new BigNumber(0),
    };
    if (
      !amount(child.filledBaseAmount).eq(sum.base) ||
      !amount(child.filledQuoteAmount).eq(sum.quote)
    ) {
      throw new Error(
        'Lighter TWAP child fill totals do not match complete trade history',
      );
    }
    executed = executed.plus(sum.base);
    notional = notional.plus(sum.quote);
  }
  if (
    !amount(parent.filledBaseAmount).eq(executed) ||
    !amount(parent.filledQuoteAmount).eq(notional) ||
    executed.gt(intent.size)
  ) {
    throw new Error(
      'Lighter TWAP parent fill totals do not match complete child history',
    );
  }
  let status: TwapOrderStatus;
  if (['in-progress', 'pending', 'open'].includes(parent.status)) {
    status = 'active';
  } else if (parent.status === 'filled') {
    if (!executed.eq(intent.size)) {
      throw new Error('Lighter TWAP filled parent is underfilled');
    }
    status = 'completed';
  } else if (parent.status === 'canceled-expired') {
    status = executed.eq(intent.size) ? 'completed' : 'completed_underfilled';
  } else if (parent.status === 'canceled') {
    status = 'canceled';
  } else {
    throw new Error(
      `Lighter TWAP parent status mapping is unverified: ${parent.status}`,
    );
  }
  if (
    status !== 'active' &&
    children.some((child) =>
      ['in-progress', 'pending', 'open'].includes(child.status),
    )
  ) {
    throw new Error(
      'Lighter TWAP terminal parent still has active child orders',
    );
  }
  const elapsed = Math.max(
    0,
    Math.min(observedAt, intent.orderExpiry) - intent.startedAt,
  );
  const order: TwapOrder = {
    orderId: parentOrderId,
    symbol: intent.symbol,
    side: intent.isBuy ? 'buy' : 'sell',
    size: intent.size,
    executedSize: executed.toFixed(),
    remainingSize: new BigNumber(intent.size).minus(executed).toFixed(),
    executedNotional: notional.toFixed(),
    ...(executed.gt(0)
      ? { averagePrice: notional.div(executed).toFixed() }
      : {}),
    fillProgressBps: executed
      .div(intent.size)
      .times(10_000)
      .integerValue(BigNumber.ROUND_FLOOR)
      .toNumber(),
    timeProgressBps: Math.min(
      10_000,
      Math.floor((elapsed / (intent.durationMinutes * 60_000)) * 10_000),
    ),
    elapsedTimeMilliseconds: elapsed,
    durationMinutes: intent.durationMinutes,
    randomize: false,
    reduceOnly: intent.reduceOnly,
    status,
    startedAt: intent.startedAt,
    lastUpdated: observedAt,
    fills: fills.sort(
      (a, b) => a.timestamp - b.timestamp || a.fillId.localeCompare(b.fillId),
    ),
    providerId: 'lighter',
  };
  return {
    clientOrderId: intent.clientOrderId,
    parentOrderId,
    parent,
    children,
    trades: [...uniqueTrades.values()],
    order,
    terminalObserved: status !== 'active',
  };
}
