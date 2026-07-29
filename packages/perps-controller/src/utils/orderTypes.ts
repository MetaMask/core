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
 * Recover which way a trigger fires from its price relative to the entry.
 *
 * Used when the exchange reports a trigger without naming its placement type:
 * a long takes profit above its entry and stops out below, a short the other
 * way round. Shared by both transports so they classify identically.
 *
 * @param params - Classification parameters
 * @param params.triggerPrice - Price at which the order activates
 * @param params.entryPrice - Entry price of the position it is attached to
 * @param params.positionSize - Signed position size; its sign gives the side
 * @returns The direction, or undefined when there is nothing to compare against
 */
export function classifyTriggerDirection(params: {
  triggerPrice?: string;
  entryPrice?: string;
  positionSize: string;
}): TriggerDirection | undefined {
  const { triggerPrice, entryPrice, positionSize } = params;

  const trigger = parseFloat(triggerPrice ?? '');
  const entry = parseFloat(entryPrice ?? '');
  const signedSize = parseFloat(positionSize || '0');

  if (!Number.isFinite(trigger) || !Number.isFinite(entry) || entry <= 0) {
    return undefined;
  }

  // A long takes profit above its entry and stops out below; a short is the
  // mirror image.
  const isLong = signedSize > 0;
  const isAboveEntry = trigger > entry;

  if (isLong) {
    return isAboveEntry ? 'take_profit' : 'stop';
  }
  return isAboveEntry ? 'stop' : 'take_profit';
}

/**
 * Project a normalized open order onto the position-state view of a trigger order.
 *
 * Returns undefined when the order is not a trigger, or when its direction can
 * be established neither from a named placement type nor from its price.
 *
 * @param params - Mapping parameters
 * @param params.order - Normalized open order
 * @param params.positionSize - Size of the position the trigger is attached to
 * @param params.entryPrice - Entry price, used to classify an unnamed trigger
 * @returns The position trigger order, or undefined
 */
export function buildPositionTriggerOrderFromOrder(params: {
  order: Order;
  positionSize: string;
  entryPrice?: string;
}): PositionTriggerOrder | undefined {
  const { order, positionSize, entryPrice } = params;

  if (!order.isTrigger) {
    return undefined;
  }

  // HyperLiquid sometimes reports a bare 'Trigger', naming neither direction
  // nor execution. The direction is still recoverable from the trigger price
  // against the entry, and it is what decides which array the order belongs
  // to — so an unnamed trigger is kept rather than dropped, with its execution
  // mode left unstated. Without a position to compare against there is nothing
  // to recover, and it is dropped.
  const direction =
    order.triggerOrderType === undefined
      ? classifyTriggerDirection({
          triggerPrice: order.triggerPrice ?? order.price,
          entryPrice,
          positionSize,
        })
      : getTriggerDirection(order.triggerOrderType);

  if (!direction) {
    return undefined;
  }

  const absolutePositionSize = Math.abs(parseFloat(positionSize || '0'));
  const rawSize = Math.abs(parseFloat(order.size || '0'));

  // A position-bound TP/SL covers whatever the position currently is. The
  // exchange encodes that as size 0, but `adaptOrderFromSDK` has already
  // resolved it against the position as it stood when the order was adapted,
  // so the size carried here goes stale as soon as the position is resized.
  // The flag is the durable statement of what the trigger covers; the number
  // is not. Reading the number instead would report the old size, and would
  // call the order partial whenever the position had since grown.
  const isPositionBound = order.isPositionTpsl === true;
  const size =
    isPositionBound || rawSize === 0 ? absolutePositionSize : rawSize;

  return {
    orderId: order.orderId,
    direction,
    orderType: order.triggerOrderType,
    triggerPrice: order.triggerPrice ?? order.price,
    size: size.toString(),
    isPartial:
      !isPositionBound &&
      rawSize > 0 &&
      absolutePositionSize > 0 &&
      rawSize < absolutePositionSize,
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
        `${order.orderId}:${order.direction}:${order.orderType ?? '?'}@${order.triggerPrice}x${order.size}${order.isPartial ? 'p' : ''}`,
    )
    .join(',');
}
