/**
 * Lighter API Adapter Utilities
 *
 * Adapters transforming zkLighter REST payloads into the MetaMask Perps API
 * canonical types. Portable: no mobile-specific imports; formatters are
 * injected via the MarketDataFormatters interface (same pattern as
 * myxAdapter.ts).
 *
 * Key differences from HyperLiquid:
 * - Prices/sizes are human-readable decimal strings in REST responses, but
 *   integers scaled by `supported_*_decimals` on the signing path.
 * - Position side is a `sign` field (1 = long, -1 = short).
 * - USDC collateral, single margin mode per account in the POC (cross).
 */

import { LIGHTER_MAX_LEVERAGE } from '../constants/lighterConfig.js';
import type {
  AccountState,
  MarketDataFormatters,
  MarketInfo,
  Order,
  PerpsMarketData,
  Position,
} from '../types/index.js';
import type {
  LighterApiOrder,
  LighterApiPosition,
  LighterOrderBookDetail,
  LighterOrderBookMeta,
  LighterSubAccount,
} from '../types/lighter-types.js';

/**
 * Format a price change value with sign prefix.
 *
 * @param change - The price change value to format.
 * @param formatters - Injectable formatters for platform-agnostic formatting.
 * @returns The formatted change string with sign and dollar symbol.
 */
function formatChange(
  change: number,
  formatters: MarketDataFormatters,
): string {
  if (isNaN(change) || !isFinite(change) || change === 0) {
    return '$0.00';
  }

  const formatted = formatters.formatPerpsFiat(Math.abs(change), {
    ranges: formatters.priceRangesUniversal,
  });
  const valueWithoutDollar = formatted.replace('$', '');
  return change > 0 ? `+$${valueWithoutDollar}` : `-$${valueWithoutDollar}`;
}

// ============================================================================
// Market Transformation
// ============================================================================

/**
 * Transform a Lighter order book meta entry into canonical MarketInfo.
 *
 * @param market - Market metadata from `GET /api/v1/orderBooks`.
 * @returns MetaMask Perps API market info object.
 */
export function adaptMarketFromLighter(
  market: LighterOrderBookMeta,
): MarketInfo {
  return {
    name: market.symbol,
    szDecimals: market.supportedSizeDecimals,
    maxLeverage: LIGHTER_MAX_LEVERAGE,
    marginTableId: 0, // Lighter does not use margin tables
    minimumOrderSize: parseFloat(market.minQuoteAmount),
    providerId: 'lighter',
    ...(market.status === 'active' ? {} : { isDelisted: true as const }),
  };
}

/**
 * Transform a Lighter order book detail into UI-ready PerpsMarketData.
 *
 * @param detail - Market stats from `GET /api/v1/orderBookDetails`.
 * @param formatters - Injectable formatters for platform-agnostic formatting.
 * @returns MetaMask Perps API market data object.
 */
export function adaptMarketDataFromLighter(
  detail: LighterOrderBookDetail,
  formatters: MarketDataFormatters,
): PerpsMarketData {
  const price = detail.lastTradePrice ?? 0;
  const changePercent = detail.dailyPriceChange ?? 0;
  // dailyPriceChange is a percentage; recover the absolute change.
  const changeAbs =
    changePercent === 0 ? 0 : (price * changePercent) / (100 + changePercent);

  return {
    symbol: detail.symbol,
    name: detail.symbol,
    maxLeverage: `${LIGHTER_MAX_LEVERAGE}x`,
    price: formatters.formatPerpsFiat(price, {
      ranges: formatters.priceRangesUniversal,
    }),
    change24h: formatChange(changeAbs, formatters),
    change24hPercent: `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`,
    volume: formatters.formatVolume(detail.dailyQuoteTokenVolume ?? 0),
    openInterest: formatters.formatVolume(detail.openInterest ?? 0),
  };
}

// ============================================================================
// Position Transformation
// ============================================================================

/**
 * Transform a Lighter account position into canonical Position.
 *
 * @param position - Position entry from an account payload.
 * @returns MetaMask Perps API position object.
 */
export function adaptPositionFromLighter(
  position: LighterApiPosition,
): Position {
  const size = parseFloat(position.position) * (position.sign > 0 ? 1 : -1);
  const positionValue = parseFloat(position.positionValue);
  const marginFraction = parseFloat(position.initialMarginFraction);
  // initialMarginFraction is a percentage (e.g. "20" => 5x leverage).
  const leverageValue =
    marginFraction > 0 ? Math.round(100 / marginFraction) : 1;
  const marginUsed =
    marginFraction > 0 ? (positionValue * marginFraction) / 100 : positionValue;
  const unrealizedPnl = parseFloat(position.unrealizedPnl);
  const liquidationPrice = parseFloat(position.liquidationPrice);

  return {
    symbol: position.symbol,
    size: String(size),
    entryPrice: position.avgEntryPrice,
    positionValue: position.positionValue,
    unrealizedPnl: position.unrealizedPnl,
    marginUsed: String(marginUsed),
    leverage: {
      type: 'cross',
      value: leverageValue,
    },
    liquidationPrice:
      isNaN(liquidationPrice) || liquidationPrice === 0
        ? null
        : position.liquidationPrice,
    maxLeverage: LIGHTER_MAX_LEVERAGE,
    returnOnEquity:
      marginUsed > 0 ? String((unrealizedPnl / marginUsed) * 100) : '0',
    cumulativeFunding: {
      allTime: '0',
      sinceOpen: '0',
      sinceChange: '0',
    },
    takeProfitCount: 0,
    stopLossCount: 0,
    providerId: 'lighter',
  };
}

// ============================================================================
// Account Transformation
// ============================================================================

/**
 * Transform a Lighter sub-account into canonical AccountState.
 *
 * @param account - Sub-account payload from `account`/`accountsByL1Address`.
 * @returns MetaMask Perps API account state object.
 */
export function adaptAccountStateFromLighter(
  account: LighterSubAccount,
): AccountState {
  const collateral = parseFloat(account.collateral || '0');
  const available = parseFloat(account.availableBalance || '0');
  const positions = account.positions ?? [];
  const unrealizedPnl = positions.reduce(
    (sum, position) => sum + parseFloat(position.unrealizedPnl || '0'),
    0,
  );
  const marginUsed = Math.max(collateral - available, 0);
  const totalBalance = collateral + unrealizedPnl;

  return {
    totalBalance: String(totalBalance),
    spendableBalance: String(available),
    withdrawableBalance: String(available),
    marginUsed: String(marginUsed),
    unrealizedPnl: String(unrealizedPnl),
    returnOnEquity:
      marginUsed > 0 ? String((unrealizedPnl / marginUsed) * 100) : '0',
    providerId: 'lighter',
  };
}

// ============================================================================
// Order Transformation
// ============================================================================

/**
 * Map a Lighter order status string onto the canonical status union.
 *
 * @param status - Raw status from the Lighter API.
 * @returns Canonical order status.
 */
function adaptOrderStatus(status: string): Order['status'] {
  switch (status) {
    case 'open':
    case 'pending':
    case 'in-progress':
      return 'open';
    case 'filled':
      return 'filled';
    case 'canceled':
    case 'cancelled':
    case 'canceled-post-only':
    case 'canceled-reduce-only':
    case 'canceled-position-not-allowed':
    case 'canceled-margin-not-allowed':
    case 'canceled-too-much-slippage':
    case 'canceled-not-enough-liquidity':
    case 'canceled-self-trade':
    case 'canceled-expired':
      return 'canceled';
    default:
      return 'open';
  }
}

/**
 * Transform a Lighter active order into canonical Order.
 *
 * @param order - Order entry from `GET /api/v1/accountActiveOrders`.
 * @param symbol - Market symbol for the order's `marketIndex`.
 * @returns MetaMask Perps API order object.
 */
export function adaptOrderFromLighter(
  order: LighterApiOrder,
  symbol: string,
): Order {
  const original = parseFloat(order.initialBaseAmount);
  const remaining = parseFloat(order.remainingBaseAmount);
  const filled = Math.max(original - remaining, 0);

  return {
    orderId: String(order.orderIndex),
    symbol,
    side: order.isAsk ? 'sell' : 'buy',
    orderType: order.type === 'market' ? 'market' : 'limit',
    size: order.remainingBaseAmount,
    originalSize: order.initialBaseAmount,
    price: order.price,
    filledSize: String(filled),
    remainingSize: order.remainingBaseAmount,
    status: adaptOrderStatus(order.status),
    timestamp: order.timestamp,
    reduceOnly: Boolean(order.reduceOnly),
    providerId: 'lighter',
  };
}
