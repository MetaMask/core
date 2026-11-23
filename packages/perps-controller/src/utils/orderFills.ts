import type { OrderFill } from '../types/index.js';

/**
 * Prefix a key with the fill's provider, so fills from two venues in one
 * aggregated list never share a key.
 *
 * @param providerId - `OrderFill.providerId`, set under aggregation.
 * @param key - The provider-local key.
 * @returns `providerId:key`, or `key` without a provider.
 */
function scopeToProvider(
  providerId: OrderFill['providerId'],
  key: string,
): string {
  return providerId === undefined ? key : `${providerId}:${key}`;
}

/**
 * Identity of one fill for deduplicating REST history against live fills.
 * Uses the venue's execution id when the fill has one; otherwise falls back
 * to the fill's content (`orderId-timestamp-size-price`), which is what
 * clients matched on before. Either is prefixed with `providerId` when set.
 *
 * @param fill - The fill.
 * @returns A key equal for the same execution on every transport.
 */
export function getOrderFillKey(
  fill: Pick<
    OrderFill,
    'orderId' | 'fillId' | 'timestamp' | 'size' | 'price' | 'providerId'
  >,
): string {
  return scopeToProvider(
    fill.providerId,
    fill.fillId ??
      `${fill.orderId}-${fill.timestamp}-${fill.size}-${fill.price}`,
  );
}

/**
 * The direction category fills are grouped under: `Open X` or `Close X`, a
 * flip (`Long > Short`) as reported, `Buy`, `Sell` or `Auto-Deleveraging`.
 *
 * @param direction - `OrderFill.direction`.
 * @returns The category, or undefined for a direction that is not grouped.
 */
function getFillAggregationDirection(direction: string): string | undefined {
  const [first, second] = direction.split(' ');
  if (first === 'Open' || first === 'Close') {
    return `${first} ${second}`;
  }
  if (second === '>') {
    return direction;
  }
  if (
    direction === 'Buy' ||
    direction === 'Sell' ||
    direction === 'Auto-Deleveraging'
  ) {
    return direction;
  }
  return undefined;
}

/**
 * Key that seeds which fills are shown as one trade. Fills that reduce a
 * position (`Close X`, `Sell`, `Auto-Deleveraging`) group by market,
 * direction and second, since one close can fill as several orders; others
 * group by market, direction and order id.
 *
 * @param fill - The fill.
 * @returns `symbol-direction-second-<s>` or `symbol-direction-order-<id>`
 * (`solo-<timestamp>` without an order id), prefixed with `providerId:` when
 * set, or undefined when the direction is not grouped.
 */
export function getFillAggregationKey(
  fill: Pick<
    OrderFill,
    'symbol' | 'direction' | 'timestamp' | 'orderId' | 'providerId'
  >,
): string | undefined {
  const direction = getFillAggregationDirection(fill.direction);
  if (direction === undefined) {
    return undefined;
  }
  const bucket = scopeToProvider(
    fill.providerId,
    `${fill.symbol}-${direction}`,
  );
  const reducesPosition =
    direction.startsWith('Close ') ||
    direction === 'Sell' ||
    direction === 'Auto-Deleveraging';
  return reducesPosition
    ? `${bucket}-second-${Math.floor(fill.timestamp / 1000)}`
    : `${bucket}-order-${fill.orderId || `solo-${fill.timestamp}`}`;
}
