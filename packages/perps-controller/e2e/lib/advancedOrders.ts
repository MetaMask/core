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

export const ASSET_ID = 0;
const SZ_DECIMALS = 3;
const CURRENT_PRICE = 50_000;
export const POSITION_SIZE = '0.1';
export const ORDER_SIZE = '0.1';

/**
 * Builds the case matrix: one entry per advanced order type in scope.
 *
 * @param symbol - Market symbol to trade.
 * @returns The ordered case list.
 */
export function buildCases(symbol: string): E2ECase[] {
  const base = {
    symbol,
    size: ORDER_SIZE,
    currentPrice: CURRENT_PRICE,
  };

  return [
    {
      name: 'stop_market',
      description: 'Stop market: rests until the trigger, then takes liquidity',
      params: {
        ...base,
        isBuy: false,
        orderType: 'stop_market',
        triggerPrice: '45000',
      },
      orderIndex: 0,
      expected: {
        triggerOrderType: 'stop_market',
        triggerPrice: '45000',
        execution: 'market',
        reduceOnly: false,
        size: ORDER_SIZE,
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
        triggerPrice: '45000',
        price: '44500',
      },
      orderIndex: 0,
      expected: {
        triggerOrderType: 'stop_limit',
        triggerPrice: '45000',
        execution: 'limit',
        reduceOnly: false,
        size: ORDER_SIZE,
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
        triggerPrice: '60000',
      },
      orderIndex: 0,
      expected: {
        triggerOrderType: 'take_profit_market',
        triggerPrice: '60000',
        execution: 'market',
        reduceOnly: false,
        size: ORDER_SIZE,
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
        triggerPrice: '59500',
        price: '60000',
      },
      orderIndex: 0,
      expected: {
        triggerOrderType: 'take_profit_limit',
        triggerPrice: '59500',
        execution: 'limit',
        reduceOnly: false,
        size: ORDER_SIZE,
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
        triggerPrice: '45000',
        reduceOnly: true,
      },
      orderIndex: 0,
      expected: {
        triggerOrderType: 'stop_market',
        triggerPrice: '45000',
        execution: 'market',
        reduceOnly: true,
        size: ORDER_SIZE,
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
        takeProfitPrice: '60000',
        takeProfitSize: '0.04',
        stopLossPrice: '45000',
        stopLossSize: '0.06',
      },
      // Index 1 is the attached take profit child
      orderIndex: 1,
      expected: {
        triggerOrderType: 'take_profit_limit',
        triggerPrice: '60000',
        execution: 'limit',
        reduceOnly: true,
        size: '0.04',
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
  const trigger = hasProperty(order.t, 'trigger') ? order.t.trigger : undefined;

  let orderType =
    hasProperty(order.t, 'limit') && order.t.limit.tif === 'Gtc'
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
 * Creates the HyperLiquid testnet runner.
 *
 * @returns A runner that signs and submits real testnet orders.
 */
export async function createTestnetRunner(): Promise<ExchangeRunner> {
  // Credentials only ever come from the environment for a testnet run.
  // eslint-disable-next-line n/no-process-env
  const privateKey = process.env.PERPS_E2E_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error(
      'PERPS_E2E_PRIVATE_KEY is required for --mode=testnet (funded HyperLiquid testnet key)',
    );
  }

  // eslint-disable-next-line n/no-process-env
  const address = process.env.PERPS_E2E_ADDRESS as `0x${string}` | undefined;
  if (!address) {
    throw new Error(
      'PERPS_E2E_ADDRESS is required for --mode=testnet (address of PERPS_E2E_PRIVATE_KEY)',
    );
  }

  const hyperliquid = await import('@nktkas/hyperliquid');
  const transport = new hyperliquid.HttpTransport({ isTestnet: true });
  // The SDK accepts a raw private key as its wallet; the declared union is
  // wider than what is needed here.
  const exchangeClient = new hyperliquid.ExchangeClient({
    transport,
    wallet: privateKey,
  } as unknown as ConstructorParameters<typeof hyperliquid.ExchangeClient>[0]);
  const infoClient = new hyperliquid.InfoClient({ transport });

  return {
    submit: async ({ orders, grouping }): Promise<string[]> => {
      const result = await exchangeClient.order({ orders, grouping });
      if (result.status !== 'ok') {
        throw new Error(`Order submission failed: ${JSON.stringify(result)}`);
      }
      return result.response.data.statuses.map((status: unknown) => {
        if (
          status &&
          typeof status === 'object' &&
          hasProperty(status, 'resting')
        ) {
          return String((status as { resting: { oid: number } }).resting.oid);
        }
        if (
          status &&
          typeof status === 'object' &&
          hasProperty(status, 'filled')
        ) {
          return String((status as { filled: { oid: number } }).filled.oid);
        }
        throw new Error(`Unexpected order status: ${JSON.stringify(status)}`);
      });
    },
    openOrders: async (symbol): Promise<FrontendOrder[]> => {
      const orders = await infoClient.frontendOpenOrders({ user: address });
      return orders.filter((order: FrontendOrder) => order.coin === symbol);
    },
    cancel: async ({ orderIds }): Promise<void> => {
      const result = await exchangeClient.cancel({
        cancels: orderIds.map((orderId) => ({
          a: ASSET_ID,
          o: Number(orderId),
        })),
      });
      if (result.status !== 'ok') {
        throw new Error(`Cancel failed: ${JSON.stringify(result)}`);
      }
    },
  };
}

/**
 * Builds the exchange payload for a case using the production mapping.
 *
 * @param testCase - Case under test.
 * @returns The submitted orders and grouping.
 */
export function buildSubmission(testCase: E2ECase): {
  orders: SDKOrderParams[];
  grouping: 'na' | 'normalTpsl' | 'positionTpsl';
} {
  const { params } = testCase;

  const { formattedSize, formattedPrice } = calculateOrderPriceAndSize({
    orderType: params.orderType,
    isBuy: params.isBuy,
    finalPositionSize: parseFloat(params.size),
    currentPrice: params.currentPrice ?? CURRENT_PRICE,
    limitPrice: params.price,
    triggerPrice: params.triggerPrice,
    szDecimals: SZ_DECIMALS,
  });

  return buildOrdersArray({
    assetId: ASSET_ID,
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
    szDecimals: SZ_DECIMALS,
    grouping: params.grouping,
  });
}

/**
 * Runs a single case end to end and collects its evidence.
 *
 * @param params - Run parameters.
 * @param params.testCase - Case under test.
 * @param params.runner - Exchange runner.
 * @param params.mode - Run mode, recorded in the evidence.
 * @param params.symbol - Market symbol.
 * @returns The case evidence.
 */
export async function runCase(params: {
  testCase: E2ECase;
  runner: ExchangeRunner;
  mode: Mode;
  symbol: string;
}): Promise<CaseEvidence> {
  const { testCase, runner, mode, symbol } = params;
  const { expected } = testCase;

  const submitted = buildSubmission(testCase);
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
        positionSize: POSITION_SIZE,
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
      pass: readBack?.triggerPrice === expected.triggerPrice,
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
      pass: readBack?.size === expected.size,
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
 * @returns Evidence for the error path.
 */
export function runTypedErrorCase(): {
  case: string;
  expectedError: string;
  actualError: string;
  pass: boolean;
} {
  let actualError = 'no error thrown';
  try {
    buildSubmission({
      name: 'missing_trigger_price',
      description: 'trigger placement without a trigger price',
      params: {
        symbol: 'BTC',
        isBuy: false,
        size: ORDER_SIZE,
        orderType: 'stop_market',
        currentPrice: CURRENT_PRICE,
      },
      orderIndex: 0,
      expected: { execution: 'market', reduceOnly: false, size: ORDER_SIZE },
    });
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
