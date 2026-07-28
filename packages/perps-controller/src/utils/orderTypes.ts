import type { Order, PositionTriggerOrder } from '../types/index.js';
import type {
  OrderExecution,
  OrderType,
  TriggerDirection,
  TriggerOrderType,
} from '../types/perps-types.js';

/**
 * All trigger placement types, in a stable order suitable for iteration
 * (validation tables, e2e matrices).
 */
export const TRIGGER_ORDER_TYPES = [
  'stop_market',
  'stop_limit',
  'take_profit_market',
  'take_profit_limit',
] as const satisfies readonly TriggerOrderType[];

/**
 * Order types whose price field (`OrderParams.price`) is a real limit price the
 * exchange must honour, as opposed to a slippage cap derived from the market.
 */
const LIMIT_EXECUTION_ORDER_TYPES = [
  'limit',
  'stop_limit',
  'take_profit_limit',
] as const satisfies readonly OrderType[];

/**
 * Check whether an order type is a trigger placement (stop / take profit).
 *
 * @param orderType - Order type to check.
 * @returns True when the type requires `OrderParams.triggerPrice`.
 */
export function isTriggerOrderType(
  orderType: OrderType,
): orderType is TriggerOrderType {
  return (TRIGGER_ORDER_TYPES as readonly OrderType[]).includes(orderType);
}

/**
 * Check whether an order type executes as a limit order.
 *
 * Covers plain limit orders and the `*_limit` trigger types, both of which
 * require `OrderParams.price`.
 *
 * @param orderType - Order type to check.
 * @returns True when the order executes as a limit order.
 */
export function isLimitExecutionOrderType(orderType: OrderType): boolean {
  return (LIMIT_EXECUTION_ORDER_TYPES as readonly OrderType[]).includes(
    orderType,
  );
}

/**
 * Get how an order executes, ignoring whether it is trigger-gated.
 *
 * This is also the coarse execution type that consumers predating trigger orders
 * understand (fee tiers, max order value, analytics).
 *
 * @param orderType - Order type to inspect.
 * @returns `'limit'` for limit and `*_limit` types, `'market'` otherwise.
 */
export function getTriggerExecution(orderType: OrderType): OrderExecution {
  return isLimitExecutionOrderType(orderType) ? 'limit' : 'market';
}

/**
 * Get the direction a trigger order fires in.
 *
 * @param orderType - Trigger order type.
 * @returns `'stop'` for `stop_*`, `'take_profit'` for `take_profit_*`.
 */
export function getTriggerDirection(
  orderType: TriggerOrderType,
): TriggerDirection {
  return orderType === 'stop_market' || orderType === 'stop_limit'
    ? 'stop'
    : 'take_profit';
}

/**
 * Project a normalized open order onto the position-state view of a trigger order.
 *
 * Returns undefined when the order is not a trigger order, or when the exchange
 * did not identify the placement type precisely enough to state one.
 *
 * @param params - Mapping parameters
 * @param params.order - Normalized open order
 * @param params.positionSize - Size of the position the trigger is attached to
 * @returns The position trigger order, or undefined
 */
export function buildPositionTriggerOrderFromOrder(params: {
  order: Order;
  positionSize: string;
}): PositionTriggerOrder | undefined {
  const { order, positionSize } = params;

  if (!order.isTrigger || !order.triggerOrderType) {
    return undefined;
  }

  const absolutePositionSize = Math.abs(parseFloat(positionSize || '0'));
  const rawSize = Math.abs(parseFloat(order.size || '0'));
  const size = rawSize > 0 ? rawSize : absolutePositionSize;

  return {
    orderId: order.orderId,
    orderType: order.triggerOrderType,
    triggerPrice: order.triggerPrice ?? order.price,
    size: size.toString(),
    isPartial:
      rawSize > 0 && absolutePositionSize > 0 && rawSize < absolutePositionSize,
    reduceOnly: Boolean(order.reduceOnly),
  };
}

/**
 * Build a trigger order type from its two independent dimensions.
 *
 * @param params - Trigger dimensions.
 * @param params.direction - Whether the trigger is a stop or a take profit.
 * @param params.execution - How the order executes once triggered.
 * @returns The matching trigger order type.
 */
export function buildTriggerOrderType(params: {
  direction: TriggerDirection;
  execution: OrderExecution;
}): TriggerOrderType {
  const { direction, execution } = params;

  if (direction === 'stop') {
    return execution === 'limit' ? 'stop_limit' : 'stop_market';
  }

  return execution === 'limit' ? 'take_profit_limit' : 'take_profit_market';
}

/**
 * Map the controller's time in force onto the exchange's spelling.
 *
 * Shared by the two order-building paths so they cannot drift apart.
 *
 * @param timeInForce - Requested time in force; defaults to GTC.
 * @returns The SDK time-in-force value.
 */
export function toSDKTimeInForce(
  timeInForce?: 'GTC' | 'IOC' | 'ALO',
): 'Gtc' | 'Ioc' | 'Alo' {
  switch (timeInForce) {
    case 'IOC':
      return 'Ioc';
    case 'ALO':
      return 'Alo';
    default:
      return 'Gtc';
  }
}

/**
 * Hash the identity of a position's trigger orders for change detection.
 *
 * Streamed positions only re-emit when their hash changes, so this has to move
 * when a trigger is added, removed, repriced, resized, or retyped — otherwise
 * subscribers never receive the updated arrays.
 *
 * The placement type is part of the identity because a trigger can be modified
 * in place: switching a stop from market to limit execution keeps its order ID,
 * trigger price, and size, so nothing else here would move even though the
 * execution semantics subscribers rely on have changed.
 *
 * @param orders - Trigger orders attached to a position, if any.
 * @returns A stable string; `'0'` for both empty and absent.
 */
export function hashTriggerOrders(orders?: PositionTriggerOrder[]): string {
  if (!orders || orders.length === 0) {
    return '0';
  }
  return orders
    .map(
      (order) =>
        `${order.orderId}:${order.orderType}@${order.triggerPrice}x${order.size}${order.isPartial ? 'p' : ''}`,
    )
    .join(',');
}
