/**
 * Advanced order types — shared e2e contract matrix (TAT-3511).
 *
 * The case matrix, the exchange doubles, and the round-trip assertions live here
 * so that exactly the same contract is exercised by:
 *
 * - `e2e/advanced-orders.e2e.ts` — the scripted run that writes evidence
 *   artifacts (simulated, or against HyperLiquid testnet).
 * - `tests/src/e2e/advanced-orders.contract.test.ts` — the Jest guard that runs
 *   in CI, so the proven contract cannot silently regress.
 */
import { hasProperty } from '@metamask/utils';

import { PERPS_ERROR_CODES } from '../../src/perpsErrorCodes.js';
import type {
  FrontendOrder,
  SDKOrderParams,
} from '../../src/types/hyperliquid-types.js';
import type { Order, OrderParams } from '../../src/types/index.js';
import type { TriggerOrderType } from '../../src/types/perps-types.js';
import {
  adaptOrderFromSDK,
  adaptPositionTriggerOrderFromSDK,
  formatHyperLiquidPrice,
  formatHyperLiquidSize,
} from '../../src/utils/hyperLiquidAdapter.js';
import {
  buildOrdersArray,
  calculateOrderPriceAndSize,
} from '../../src/utils/orderCalculations.js';

export type Mode = 'simulated' | 'testnet';

export type CaseExpectation = {
  triggerOrderType?: TriggerOrderType;
  triggerPrice?: string;
  execution: 'market' | 'limit';
  reduceOnly: boolean;
  /** Expected size of the resting order that carries the trigger */
  size: string;
  /** Expected `isPartial` on the position-state view, when applicable */
  isPartial?: boolean;
};

export type E2ECase = {
  name: string;
  description: string;
  params: OrderParams;
  /** Which submitted order carries the behaviour under test (0 = main order) */
  orderIndex: number;
  expected: CaseExpectation;
};

export type CaseEvidence = {
  case: string;
  description: string;
  mode: Mode;
  params: OrderParams;
  submitted: { grouping: string; orders: SDKOrderParams[] };
  placedOrderIds: string[];
  readBack: Order | null;
  positionTriggerView: ReturnType<
    typeof adaptPositionTriggerOrderFromSDK
  > | null;
  cancelled: boolean;
  openOrdersAfterCancel: string[];
  checks: { name: string; expected: unknown; actual: unknown; pass: boolean }[];
  pass: boolean;
};

/**
 * Everything the matrix needs in order to describe an order without naming a
 * number that only holds for one market at one moment.
 *
 * `mid` and `szDecimals` come from the venue on a testnet run; on the simulated
 * run they describe the in-process double rather than any real market. Every
 * price below is an offset from `mid` and every size a share of the order, so
 * the same matrix holds whatever the asset is worth today.
 */
export type CaseContext = {
  symbol: string;
  /**
   * The venue's index for this market. Read from its meta rather than assumed:
   * index 0 is a different asset on testnet than on mainnet, and submitting
   * against the wrong one silently trades the wrong market.
   */
  assetId: number;
  /** Live mid on testnet; the double's reference price when simulated. */
  mid: number;
  /** Size precision, read from the venue's meta rather than assumed. */
  szDecimals: number;
  /** USD per probe order. Raised when a partial slice would not be expressible. */
  notional: number;
  /** Where a stop rests, as a percentage from mid. Negative sits below. */
  stopOffsetPct: number;
  /** Where a take profit rests, as a percentage from mid. Positive sits above. */
  takeProfitOffsetPct: number;
  /** How far a trigger's limit price sits from its own trigger, as a percentage. */
  limitSlipPct: number;
  /** Share of the order a partial TP/SL covers. */
  partialFraction: number;
};

/**
 * Build a case context, filling in the parts a caller does not pin.
 *
 * @param overrides - At minimum the market, its mid, and its size precision.
 * @returns A fully resolved context.
 */
export function caseContext(
  overrides: Pick<CaseContext, 'symbol' | 'mid' | 'szDecimals' | 'assetId'> &
    Partial<CaseContext>,
): CaseContext {
  return {
    notional: 11,
    stopOffsetPct: -10,
    takeProfitOffsetPct: 20,
    limitSlipPct: 1,
    partialFraction: 0.4,
    ...overrides,
  };
}

/**
 * Resolve the order size for a context.
 *
 * A probe is sized from a USD notional so it stays small on any asset, but a
 * notional that is small enough on a cheap asset can produce a size that
 * disappears at an expensive one's precision — and a partial slice of it
 * disappears sooner still. The size is therefore floored at the smallest whole
 * order whose partial slice is expressible, rather than assuming any of it.
 *
 * @param ctx - Case context.
 * @returns The order size, formatted to the asset's precision.
 */
function orderSizeFor(ctx: CaseContext): string {
  const tick = 1 / 10 ** ctx.szDecimals;
  const smallestSlice = Math.min(ctx.partialFraction, 1 - ctx.partialFraction);
  const minWholeOrder = tick / Math.max(smallestSlice, Number.EPSILON);
  // An order resting away from mid is worth less than the same size at mid, so
  // sizing from mid alone puts the cheapest resting order under the venue's
  // minimum value. Size against the furthest-below price the matrix uses.
  const worstRestingPrice =
    ctx.mid * (1 + Math.min(ctx.stopOffsetPct - ctx.limitSlipPct, 0) / 100);
  const fromNotional =
    ctx.notional / Math.max(worstRestingPrice, Number.EPSILON);
  return formatHyperLiquidSize({
    size: Math.max(fromNotional, minWholeOrder),
    szDecimals: ctx.szDecimals,
  });
}

/**
 * Builds the case matrix: one entry per advanced order type in scope.
 *
 * Every price is an offset from the context's mid and every size a share of the
 * order, so the matrix describes the same contract whatever the asset is worth.
 * Offsets are chosen so each order RESTS: a sell stop below mid, a sell take
 * profit above it. A trigger whose condition is already met fires on submission
 * and leaves nothing to read back.
 *
 * @param ctx - Case context.
 * @returns The ordered case list.
 */
export function buildCases(ctx: CaseContext): E2ECase[] {
  const size = orderSizeFor(ctx);
  const priceAt = (pct: number): string =>
    formatHyperLiquidPrice({
      price: ctx.mid * (1 + pct / 100),
      szDecimals: ctx.szDecimals,
    });
  const shareOf = (fraction: number): string =>
    formatHyperLiquidSize({
      size: parseFloat(size) * fraction,
      szDecimals: ctx.szDecimals,
    });

  const stopTrigger = priceAt(ctx.stopOffsetPct);
  // The limit sits past the trigger, so a fired order still has room to fill.
  const stopLimit = priceAt(ctx.stopOffsetPct - ctx.limitSlipPct);
  const takeProfitTrigger = priceAt(ctx.takeProfitOffsetPct);
  const takeProfitLimit = priceAt(ctx.takeProfitOffsetPct + ctx.limitSlipPct);

  const base = { symbol: ctx.symbol, size, currentPrice: ctx.mid };

  return [
    {
      name: 'stop_market',
      description: 'Stop market: rests until the trigger, then takes liquidity',
      params: {
        ...base,
        isBuy: false,
        orderType: 'stop_market',
        triggerPrice: stopTrigger,
      },
      orderIndex: 0,
      expected: {
        triggerOrderType: 'stop_market',
        triggerPrice: stopTrigger,
        execution: 'market',
        reduceOnly: false,
        size,
      },
    },
    {
      name: 'stop_limit',
      description:
        'Stop limit: rests until the trigger, then posts a limit order',
      params: {
        ...base,
        isBuy: false,
        orderType: 'stop_limit',
        triggerPrice: stopTrigger,
        price: stopLimit,
      },
      orderIndex: 0,
      expected: {
        triggerOrderType: 'stop_limit',
        triggerPrice: stopTrigger,
        execution: 'limit',
        reduceOnly: false,
        size,
      },
    },
    {
      name: 'take_profit_market',
      description:
        'Take profit market: fires above the mark and takes liquidity',
      params: {
        ...base,
        isBuy: false,
        orderType: 'take_profit_market',
        triggerPrice: takeProfitTrigger,
      },
      orderIndex: 0,
      expected: {
        triggerOrderType: 'take_profit_market',
        triggerPrice: takeProfitTrigger,
        execution: 'market',
        reduceOnly: false,
        size,
      },
    },
    {
      name: 'take_profit_limit',
      description:
        'Take profit limit: fires above the mark and posts a limit order',
      params: {
        ...base,
        isBuy: false,
        orderType: 'take_profit_limit',
        triggerPrice: takeProfitTrigger,
        price: takeProfitLimit,
      },
      orderIndex: 0,
      expected: {
        triggerOrderType: 'take_profit_limit',
        triggerPrice: takeProfitTrigger,
        execution: 'limit',
        reduceOnly: false,
        size,
      },
    },
    {
      name: 'reduce_only',
      description:
        'Reduce-only as a first-class placement flag on a trigger order',
      params: {
        ...base,
        isBuy: false,
        orderType: 'stop_market',
        triggerPrice: stopTrigger,
        reduceOnly: true,
      },
      orderIndex: 0,
      expected: {
        triggerOrderType: 'stop_market',
        triggerPrice: stopTrigger,
        execution: 'market',
        reduceOnly: true,
        size,
        isPartial: false,
      },
    },
    {
      name: 'partial_take_profit',
      description:
        'Partial TP/SL: quantity-scoped take profit attached to the order',
      params: {
        ...base,
        isBuy: true,
        orderType: 'market',
        takeProfitPrice: takeProfitTrigger,
        takeProfitSize: shareOf(ctx.partialFraction),
        stopLossPrice: stopTrigger,
        stopLossSize: shareOf(1 - ctx.partialFraction),
      },
      // Index 1 is the attached take profit child
      orderIndex: 1,
      expected: {
        triggerOrderType: 'take_profit_limit',
        triggerPrice: takeProfitTrigger,
        execution: 'limit',
        reduceOnly: true,
        size: shareOf(ctx.partialFraction),
        isPartial: true,
      },
    },
  ];
}

/**
 * Maps a submitted SDK order onto the HyperLiquid `frontendOpenOrders` shape,
 * mirroring how the exchange echoes a resting order back.
 *
 * @param params - Rendering parameters.
 * @param params.order - Submitted SDK order.
 * @param params.oid - Order ID assigned by the exchange.
 * @param params.symbol - Market symbol.
 * @returns The rendered frontend order.
 */
function renderRestingOrder(params: {
  order: SDKOrderParams;
  oid: number;
  symbol: string;
}): FrontendOrder {
  const { order, oid, symbol } = params;
  // `hasProperty` narrows the key, not the value: the SDK's order-type union
  // leaves it `unknown`, so shape the two variants explicitly.
  const orderTypeField = order.t as {
    trigger?: { tpsl: 'tp' | 'sl'; isMarket: boolean; triggerPx: string };
    limit?: { tif: string };
  };
  const trigger = hasProperty(order.t, 'trigger')
    ? orderTypeField.trigger
    : undefined;

  let orderType =
    hasProperty(order.t, 'limit') && orderTypeField.limit?.tif === 'Gtc'
      ? 'Limit'
      : 'Market';
  if (trigger) {
    const direction = trigger.tpsl === 'tp' ? 'Take Profit' : 'Stop';
    orderType = `${direction} ${trigger.isMarket ? 'Market' : 'Limit'}`;
  }

  return {
    coin: symbol,
    side: order.b ? 'B' : 'A',
    limitPx: order.p,
    sz: order.s,
    origSz: order.s,
    oid,
    timestamp: 1_700_000_000_000,
    triggerCondition: trigger
      ? `Price ${trigger.tpsl === 'tp' ? 'above' : 'below'} ${trigger.triggerPx}`
      : 'N/A',
    isTrigger: Boolean(trigger),
    triggerPx: trigger?.triggerPx ?? '',
    children: [],
    isPositionTpsl: false,
    reduceOnly: order.r,
    orderType,
  } as unknown as FrontendOrder;
}

/**
 * Minimal transport contract shared by the simulated and testnet runners.
 */
export type ExchangeRunner = {
  submit(params: {
    orders: SDKOrderParams[];
    grouping: 'na' | 'normalTpsl' | 'positionTpsl';
    symbol: string;
  }): Promise<string[]>;
  openOrders(symbol: string): Promise<FrontendOrder[]>;
  cancel(params: { orderIds: string[]; symbol: string }): Promise<void>;
};

/**
 * Creates the in-process HyperLiquid double.
 *
 * @returns A runner backed by an in-memory order book of resting orders.
 */
export function createSimulatedRunner(): ExchangeRunner {
  let nextOid = 1000;
  const resting = new Map<string, FrontendOrder>();

  return {
    submit: async ({ orders, symbol }): Promise<string[]> => {
      const ids: string[] = [];
      for (const order of orders) {
        nextOid += 1;
        const rendered = renderRestingOrder({ order, oid: nextOid, symbol });
        resting.set(String(nextOid), rendered);
        ids.push(String(nextOid));
      }
      return ids;
    },
    openOrders: async (symbol): Promise<FrontendOrder[]> =>
      Array.from(resting.values()).filter((order) => order.coin === symbol),
    cancel: async ({ orderIds }): Promise<void> => {
      for (const orderId of orderIds) {
        resting.delete(orderId);
      }
    },
  };
}

/**
 * Builds the exchange payload for a case using the production mapping.
 *
 * @param testCase - Case under test.
 * @param ctx - Case context, supplying the market index and precision.
 * @returns The submitted orders and grouping.
 */
export function buildSubmission(
  testCase: E2ECase,
  ctx: CaseContext,
): {
  orders: SDKOrderParams[];
  grouping: 'na' | 'normalTpsl' | 'positionTpsl';
} {
  const { params } = testCase;

  const { formattedSize, formattedPrice } = calculateOrderPriceAndSize({
    orderType: params.orderType,
    isBuy: params.isBuy,
    finalPositionSize: parseFloat(params.size),
    currentPrice: params.currentPrice ?? ctx.mid,
    limitPrice: params.price,
    triggerPrice: params.triggerPrice,
    szDecimals: ctx.szDecimals,
  });

  return buildOrdersArray({
    assetId: ctx.assetId,
    isBuy: params.isBuy,
    formattedPrice,
    formattedSize,
    reduceOnly: params.reduceOnly ?? false,
    orderType: params.orderType,
    triggerPrice: params.triggerPrice,
    takeProfitPrice: params.takeProfitPrice,
    stopLossPrice: params.stopLossPrice,
    takeProfitSize: params.takeProfitSize,
    stopLossSize: params.stopLossSize,
    szDecimals: ctx.szDecimals,
    grouping: params.grouping,
  });
}

/**
 * Compare two exchange-formatted numbers by value.
 *
 * A venue may echo a price back in a different but equivalent spelling —
 * `57650.0` for the `57650` that was submitted — so comparing the strings
 * fails on values that are in fact identical. The simulated double echoes our
 * own string back, so only a real venue shows this.
 *
 * @param actual - Value read back from the venue.
 * @param expected - Value that was submitted.
 * @returns True when both parse to the same number.
 */
function sameNumber(actual?: string, expected?: string): boolean {
  if (actual === undefined || expected === undefined) {
    return actual === expected;
  }
  const left = parseFloat(actual);
  const right = parseFloat(expected);
  return Number.isFinite(left) && Number.isFinite(right)
    ? left === right
    : actual === expected;
}

/**
 * Runs a single case end to end and collects its evidence.
 *
 * @param params - Run parameters.
 * @param params.testCase - Case under test.
 * @param params.runner - Exchange runner.
 * @param params.mode - Run mode, recorded in the evidence.
 * @param params.ctx - Case context, carrying the market and its precision.
 * @returns The case evidence.
 */
export async function runCase(params: {
  testCase: E2ECase;
  runner: ExchangeRunner;
  mode: Mode;
  ctx: CaseContext;
}): Promise<CaseEvidence> {
  const { testCase, runner, mode, ctx } = params;
  const { symbol } = ctx;
  const { expected } = testCase;

  const submitted = buildSubmission(testCase, ctx);
  const placedOrderIds = await runner.submit({
    orders: submitted.orders,
    grouping: submitted.grouping,
    symbol,
  });

  const targetOrderId = placedOrderIds[testCase.orderIndex];
  const openOrders = await runner.openOrders(symbol);
  const rawOrder = openOrders.find(
    (order) => String(order.oid) === targetOrderId,
  );
  const readBack = rawOrder ? adaptOrderFromSDK(rawOrder) : null;
  const positionTriggerView = rawOrder
    ? (adaptPositionTriggerOrderFromSDK({
        rawOrder,
        positionSize: testCase.params.size,
      }) ?? null)
    : null;

  const checks: CaseEvidence['checks'] = [
    {
      name: 'order is visible in open orders',
      expected: true,
      actual: Boolean(readBack),
      pass: Boolean(readBack),
    },
    {
      name: 'placement type round-trips',
      expected: expected.triggerOrderType,
      actual: readBack?.triggerOrderType,
      pass: readBack?.triggerOrderType === expected.triggerOrderType,
    },
    {
      name: 'trigger price round-trips',
      expected: expected.triggerPrice,
      actual: readBack?.triggerPrice,
      pass: sameNumber(readBack?.triggerPrice, expected.triggerPrice),
    },
    {
      name: 'execution mode round-trips',
      expected: expected.execution,
      actual: readBack?.orderType,
      pass: readBack?.orderType === expected.execution,
    },
    {
      name: 'reduce-only flag round-trips',
      expected: expected.reduceOnly,
      actual: readBack?.reduceOnly,
      pass: Boolean(readBack?.reduceOnly) === expected.reduceOnly,
    },
    {
      name: 'quantity round-trips',
      expected: expected.size,
      actual: readBack?.size,
      pass: sameNumber(readBack?.size, expected.size),
    },
  ];

  if (expected.isPartial !== undefined) {
    checks.push({
      name: 'partial quantity is represented on the position view',
      expected: expected.isPartial,
      actual: positionTriggerView?.isPartial,
      pass: positionTriggerView?.isPartial === expected.isPartial,
    });
  }

  await runner.cancel({ orderIds: placedOrderIds, symbol });
  const remaining = await runner.openOrders(symbol);
  const openOrdersAfterCancel = remaining.map((order) => String(order.oid));
  const cancelled = placedOrderIds.every(
    (orderId) => !openOrdersAfterCancel.includes(orderId),
  );

  checks.push({
    name: 'order is gone after cancel',
    expected: [],
    actual: placedOrderIds.filter((orderId) =>
      openOrdersAfterCancel.includes(orderId),
    ),
    pass: cancelled,
  });

  return {
    case: testCase.name,
    description: testCase.description,
    mode,
    params: testCase.params,
    submitted,
    placedOrderIds,
    readBack,
    positionTriggerView,
    cancelled,
    openOrdersAfterCancel,
    checks,
    pass: checks.every((check) => check.pass),
  };
}

/**
 * Proves that an invalid trigger placement fails with a typed error rather than
 * silently placing something else.
 *
 * @param ctx - Case context, so the invalid order is described like any other.
 * @returns Evidence for the error path.
 */
export function runTypedErrorCase(ctx: CaseContext): {
  case: string;
  expectedError: string;
  actualError: string;
  pass: boolean;
} {
  let actualError = 'no error thrown';
  const size = orderSizeFor(ctx);
  try {
    buildSubmission(
      {
        name: 'missing_trigger_price',
        description: 'trigger placement without a trigger price',
        params: {
          symbol: ctx.symbol,
          isBuy: false,
          size,
          orderType: 'stop_market',
          currentPrice: ctx.mid,
        },
        orderIndex: 0,
        expected: { execution: 'market', reduceOnly: false, size },
      },
      ctx,
    );
  } catch (error) {
    actualError = error instanceof Error ? error.message : String(error);
  }

  return {
    case: 'typed_error_missing_trigger_price',
    expectedError: PERPS_ERROR_CODES.ORDER_TRIGGER_PRICE_REQUIRED,
    actualError,
    pass: actualError === PERPS_ERROR_CODES.ORDER_TRIGGER_PRICE_REQUIRED,
  };
}

// --- Exchange premises ---------------------------------------------------
//
// The cases above prove what the controller DOES. These prove why it must:
// each one is a claim about how HyperLiquid behaves that a guard in the
// controller depends on. Those claims were asserted during review and never
// executed, so every guard below rests on an assumption until this matrix runs
// against testnet.
//
// They deliberately hand-build the SDK payload instead of going through
// `buildOrdersArray` / `validateOrderParams`. That is the whole point: the
// controller now refuses these shapes, so the only way to ask the exchange what
// it would have done is to bypass our own builders and submit directly.
//
// The simulated runner renders our own payload back as resting orders and can
// never reject anything, so a premise cannot be proven there. It is recorded as
// skipped rather than passing vacuously.

export type PremiseOutcome = 'rejected' | 'accepted' | 'skipped';

export type PremiseCase = {
  name: string;
  /** The claim about the venue, in words. */
  premise: string;
  /** The controller guard that rests on it. */
  justifies: string;
  /** Hand-built payload, deliberately bypassing the production builders. */
  build: (symbol: string) => {
    orders: SDKOrderParams[];
    grouping: 'na' | 'normalTpsl' | 'positionTpsl';
  };
  /** What the venue is claimed to do with that payload. */
  expect: Exclude<PremiseOutcome, 'skipped'>;
  /**
   * Optional follow-up for a premise that is about what happens AFTER the
   * payload is accepted — a zero-size trigger covering the whole position, or
   * orphaned children outliving a cancelled parent.
   */
  verify?: (params: {
    runner: ExchangeRunner;
    symbol: string;
    placedOrderIds: string[];
  }) => Promise<{ pass: boolean; detail: unknown }>;
};

export type PremiseEvidence = {
  case: string;
  premise: string;
  justifies: string;
  mode: Mode;
  expected: PremiseOutcome;
  outcome: PremiseOutcome;
  submitted: {
    grouping: string;
    orders: SDKOrderParams[];
  } | null;
  exchangeError: string | null;
  verification: { pass: boolean; detail: unknown } | null;
  pass: boolean;
  note: string | null;
};

/**
 * A resting trigger order in the SDK's submitted shape.
 *
 * @param params - Order fields.
 * @param params.assetId - The venue's index for the market.
 * @param params.price - Limit/cap price submitted as `p`.
 * @param params.size - Size submitted as `s`.
 * @param params.triggerPx - Trigger price.
 * @param params.isMarket - Whether it executes as market once triggered.
 * @param params.tpsl - Trigger direction.
 * @returns The SDK order params.
 */
function triggerOrder(params: {
  assetId: number;
  price: string;
  size: string;
  triggerPx: string;
  isMarket: boolean;
  tpsl: 'tp' | 'sl';
}): SDKOrderParams {
  return {
    a: params.assetId,
    b: false,
    p: params.price,
    s: params.size,
    r: true,
    t: {
      trigger: {
        isMarket: params.isMarket,
        triggerPx: params.triggerPx,
        tpsl: params.tpsl,
      },
    },
  };
}

/**
 * An ordinary resting limit order in the SDK's submitted shape.
 *
 * @param params - Order fields.
 * @param params.assetId - The venue's index for the market.
 * @param params.price - Resting price.
 * @param params.size - Order size.
 * @returns The SDK order params.
 */
function plainLimitOrder(params: {
  assetId: number;
  price: string;
  size: string;
}): SDKOrderParams {
  return {
    a: params.assetId,
    b: true,
    p: params.price,
    s: params.size,
    r: false,
    t: { limit: { tif: 'Gtc' } },
  };
}

/**
 * Builds the premise matrix: one entry per claim a controller guard rests on.
 *
 * @param ctx - Case context; prices and sizes are derived from it.
 * @returns The ordered premise list.
 */
export function buildPremiseCases(ctx: CaseContext): PremiseCase[] {
  const size = orderSizeFor(ctx);
  const priceAt = (pct: number): string =>
    formatHyperLiquidPrice({
      price: ctx.mid * (1 + pct / 100),
      szDecimals: ctx.szDecimals,
    });
  // A premise probe must also rest rather than fire on submission, so it uses
  // the same resting offsets as the placement matrix.
  const restingStop = priceAt(ctx.stopOffsetPct);
  const restingTakeProfit = priceAt(ctx.takeProfitOffsetPct);

  return [
    {
      name: 'position_tpsl_batch_with_plain_parent',
      premise:
        'HyperLiquid rejects a positionTpsl batch that contains a non-trigger order.',
      justifies:
        'validateOrderParams refuses tpslLinkage=position on an order placement (ORDER_TPSL_POSITION_LINKAGE_UNSUPPORTED).',
      expect: 'rejected',
      build: () => ({
        grouping: 'positionTpsl',
        orders: [
          plainLimitOrder({ assetId: ctx.assetId, price: restingStop, size }),
          triggerOrder({
            assetId: ctx.assetId,
            price: restingTakeProfit,
            size,
            triggerPx: restingTakeProfit,
            isMarket: false,
            tpsl: 'tp',
          }),
        ],
      }),
    },
    {
      name: 'zero_trigger_price',
      premise: 'HyperLiquid rejects a trigger order whose triggerPx is 0.',
      justifies:
        'validateOrderPrecision refuses a trigger price that rounds away at the asset precision (ORDER_TRIGGER_PRICE_POSITIVE).',
      expect: 'rejected',
      build: () => ({
        grouping: 'na',
        orders: [
          triggerOrder({
            assetId: ctx.assetId,
            price: restingStop,
            size,
            triggerPx: '0',
            isMarket: false,
            tpsl: 'sl',
          }),
        ],
      }),
    },
    {
      name: 'zero_cap_price_on_market_trigger',
      premise:
        'HyperLiquid rejects a market-on-trigger order submitted with p = 0.',
      justifies:
        'adaptOrderToSDK derives a slippage cap from the trigger price instead of emitting p: "0".',
      expect: 'rejected',
      build: () => ({
        grouping: 'na',
        orders: [
          triggerOrder({
            assetId: ctx.assetId,
            price: '0',
            size,
            triggerPx: restingStop,
            isMarket: true,
            tpsl: 'sl',
          }),
        ],
      }),
    },
    {
      name: 'zero_size_trigger_is_whole_position',
      premise:
        'HyperLiquid accepts a zero-size trigger and reads it as covering the whole position.',
      justifies:
        'A partial TP/SL size that formats to "0" is refused, because submitting it would silently widen a partial close to the whole position (ORDER_TPSL_SIZE_INVALID).',
      expect: 'accepted',
      build: () => ({
        grouping: 'na',
        orders: [
          triggerOrder({
            assetId: ctx.assetId,
            price: restingTakeProfit,
            size: '0',
            triggerPx: restingTakeProfit,
            isMarket: false,
            tpsl: 'tp',
          }),
        ],
      }),
      verify: async ({
        runner,
        symbol,
        placedOrderIds,
      }): Promise<{ pass: boolean; detail: unknown }> => {
        const resting = await runner.openOrders(symbol);
        const placed = resting.find((order) =>
          placedOrderIds.includes(String(order.oid)),
        );
        // The venue reporting it as position-bound is the observable form of
        // "covers the whole position"; a partial would carry its own size.
        return {
          pass: placed?.isPositionTpsl === true || placed?.sz === '0',
          detail: placed
            ? {
                oid: placed.oid,
                sz: placed.sz,
                isPositionTpsl: placed.isPositionTpsl,
              }
            : { found: false },
        };
      },
    },
    {
      name: 'na_grouping_orphans_children',
      premise:
        'Children submitted under na grouping outlive their parent: cancelling the parent leaves them resting.',
      justifies:
        'validateOrderParams refuses an attached TP/SL with no linkage (ORDER_TPSL_LINKAGE_REQUIRED), which would otherwise leave orphan reduce-only triggers behind.',
      expect: 'accepted',
      build: () => ({
        grouping: 'na',
        orders: [
          plainLimitOrder({ assetId: ctx.assetId, price: restingStop, size }),
          triggerOrder({
            assetId: ctx.assetId,
            price: restingTakeProfit,
            size,
            triggerPx: restingTakeProfit,
            isMarket: false,
            tpsl: 'tp',
          }),
        ],
      }),
      verify: async ({
        runner,
        symbol,
        placedOrderIds,
      }): Promise<{ pass: boolean; detail: unknown }> => {
        const [parentId, ...childIds] = placedOrderIds;
        await runner.cancel({ orderIds: [parentId], symbol });
        const resting = await runner.openOrders(symbol);
        const survivors = childIds.filter((id) =>
          resting.some((order) => String(order.oid) === id),
        );
        // Orphaned children are the failure this guard exists to prevent, so
        // survival is what confirms the premise.
        return {
          pass: survivors.length === childIds.length,
          detail: { parentId, childIds, survivors },
        };
      },
    },
  ];
}

/**
 * Runs a single premise against the venue and collects its evidence.
 *
 * @param params - Run parameters.
 * @param params.premiseCase - Premise under test.
 * @param params.runner - Exchange runner.
 * @param params.mode - Run mode; simulated cannot prove a premise.
 * @param params.symbol - Market symbol.
 * @returns The premise evidence.
 */
export async function runPremiseCase(params: {
  premiseCase: PremiseCase;
  runner: ExchangeRunner;
  mode: Mode;
  symbol: string;
}): Promise<PremiseEvidence> {
  const { premiseCase, runner, mode, symbol } = params;

  const base = {
    case: premiseCase.name,
    premise: premiseCase.premise,
    justifies: premiseCase.justifies,
    mode,
    expected: premiseCase.expect as PremiseOutcome,
  };

  if (mode !== 'testnet') {
    return {
      ...base,
      outcome: 'skipped',
      submitted: null,
      exchangeError: null,
      verification: null,
      pass: false,
      note: 'Skipped: the simulated exchange renders submitted payloads back and never rejects, so it cannot establish what the venue does.',
    };
  }

  const submitted = premiseCase.build(symbol);
  let placedOrderIds: string[] = [];
  let exchangeError: string | null = null;

  try {
    placedOrderIds = await runner.submit({ ...submitted, symbol });
  } catch (error) {
    exchangeError = error instanceof Error ? error.message : String(error);
  }

  const outcome: PremiseOutcome =
    exchangeError === null ? 'accepted' : 'rejected';
  if (outcome !== premiseCase.expect) {
    return {
      ...base,
      outcome,
      submitted,
      exchangeError,
      verification: null,
      pass: false,
      note:
        outcome === 'accepted'
          ? 'The venue accepted a payload the guard assumes it rejects. The guard it justifies needs revisiting.'
          : 'The venue rejected a payload the guard assumes it accepts. The guard it justifies needs revisiting.',
    };
  }

  let verification: { pass: boolean; detail: unknown } | null = null;
  if (premiseCase.verify && outcome === 'accepted') {
    verification = await premiseCase.verify({ runner, symbol, placedOrderIds });
  }

  // Leave nothing resting: an accepted premise placed real orders.
  if (placedOrderIds.length > 0) {
    try {
      await runner.cancel({ orderIds: placedOrderIds, symbol });
    } catch {
      // Already cancelled by a verify step, or never rested. Not a proof failure.
    }
  }

  return {
    ...base,
    outcome,
    submitted,
    exchangeError,
    verification,
    pass: verification === null ? true : verification.pass,
    note: null,
  };
}
