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

import {
  LIGHTER_MAX_LEVERAGE,
  LIGHTER_UNSUPPORTED_CAPABILITY_PREFIX,
} from '../constants/lighterConfig.js';
import type {
  AccountState,
  MarketDataFormatters,
  MarketInfo,
  Order,
  OrderFill,
  PerpsMarketData,
  Position,
  PriceUpdate,
} from '../types/index.js';
import type {
  LighterApiOrder,
  LighterApiPosition,
  LighterOrderBookDetail,
  LighterOrderBookMeta,
  LighterRestTrade,
  LighterWsTrade,
  LighterSubAccount,
  LighterWsMarketStat,
  LighterWsUserStats,
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

  const maxLeverage =
    detail.minInitialMarginFraction && detail.minInitialMarginFraction > 0
      ? Math.floor(10_000 / detail.minInitialMarginFraction)
      : LIGHTER_MAX_LEVERAGE;
  return {
    symbol: detail.symbol,
    name: detail.symbol,
    maxLeverage: `${maxLeverage}x`,
    price: formatters.formatPerpsFiat(price, {
      ranges: formatters.priceRangesUniversal,
    }),
    change24h: formatChange(changeAbs, formatters),
    change24hPercent: `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`,
    volume: formatters.formatVolume(detail.dailyQuoteTokenVolume ?? 0),
    openInterest: formatters.formatVolume(detail.openInterest ?? 0),
  };
}

/**
 * Transform a Lighter order book detail into a canonical PriceUpdate for
 * price-stream subscribers (REST polling stands in for a WS feed in the POC).
 *
 * @param detail - Market stats from `GET /api/v1/orderBookDetails`.
 * @param timestamp - Update timestamp (injected for determinism in tests).
 * @returns MetaMask Perps API price update object.
 */
export function adaptPriceUpdateFromLighter(
  detail: LighterOrderBookDetail,
  timestamp: number,
): PriceUpdate {
  return {
    symbol: detail.symbol,
    price: String(detail.lastTradePrice ?? 0),
    timestamp,
    percentChange24h: String(detail.dailyPriceChange ?? 0),
    volume24h: detail.dailyQuoteTokenVolume ?? 0,
    openInterest: detail.openInterest ?? 0,
    isTradable: detail.status === 'active',
  };
}

/**
 * Transform a `market_stats` WebSocket entry into a canonical PriceUpdate.
 * Richer than the REST fallback: carries mid/bid/ask, mark price, and funding.
 *
 * @param stat - Market stats entry from the `market_stats/all` WS channel.
 * @param timestamp - Update timestamp (injected for determinism in tests).
 * @returns MetaMask Perps API price update object.
 */
export function adaptPriceUpdateFromLighterWsStat(
  stat: LighterWsMarketStat,
  timestamp: number,
): PriceUpdate {
  const bestBid = parseFloat(stat.bestBidPrice);
  const bestAsk = parseFloat(stat.bestAskPrice);
  const spread =
    Number.isFinite(bestBid) && Number.isFinite(bestAsk)
      ? String(bestAsk - bestBid)
      : undefined;
  return {
    symbol: stat.symbol,
    price: stat.midPrice,
    timestamp,
    percentChange24h: String(stat.dailyPriceChange ?? 0),
    bestBid: stat.bestBidPrice,
    bestAsk: stat.bestAskPrice,
    spread,
    markPrice: stat.markPrice,
    funding: parseFloat(stat.currentFundingRate ?? stat.fundingRate ?? '0'),
    openInterest: parseFloat(stat.openInterest ?? '0'),
    volume24h: stat.dailyQuoteTokenVolume ?? 0,
    isTradable: true,
  };
}

/**
 * Transform a `user_stats` WebSocket stats block into canonical AccountState.
 *
 * @param stats - Stats block from the `user_stats/{account_index}` channel.
 * @returns MetaMask Perps API account state object.
 */
export function adaptAccountStateFromLighterUserStats(
  stats: LighterWsUserStats,
): AccountState {
  const collateral = parseFloat(stats.collateral || '0');
  const available = parseFloat(stats.availableBalance || '0');
  const portfolioValue = parseFloat(stats.portfolioValue || '0');
  return {
    totalBalance: String(portfolioValue),
    spendableBalance: String(available),
    withdrawableBalance: String(available),
    marginUsed: String(Math.max(collateral - available, 0)),
    unrealizedPnl: String(portfolioValue - collateral),
    returnOnEquity:
      collateral > 0
        ? String(((portfolioValue - collateral) / collateral) * 100)
        : '0',
  };
}

/**
 * Transform a Lighter trade (REST `/trades` or WS `account_all_trades`) into
 * a canonical OrderFill from the perspective of `accountIndex`.
 *
 * @param trade - Trade entry (post-camelization).
 * @param symbol - Market symbol resolved from the market id.
 * @param accountIndex - The account whose perspective determines the side.
 * @returns MetaMask Perps API order fill object.
 */
/**
 * Derive the lifecycle direction of a fill from the venue's
 * position-before context, in the vocabulary client transforms consume
 * (`Open Long`, `Close Short`, `Long > Short`, ...).
 *
 * The venue reports the side's ABSOLUTE position size before the trade and
 * whether its sign changed. Combined with the trade side that is enough:
 * buying reduces shorts and opens longs; selling reduces longs and opens
 * shorts. A partial fill with no sign change is disambiguated by realized
 * pnl (closing realizes pnl, opening does not). Without position context
 * the side-only `Buy`/`Sell` vocabulary is used.
 *
 * @param context - Trade side, size, and position-before data.
 * @param context.isBuy - Whether our side bought.
 * @param context.size - Trade size (base units, absolute).
 * @param context.positionBefore - Our side's absolute position size before.
 * @param context.signChanged - Whether our side's position sign changed.
 * @param context.pnl - Realized pnl for our side.
 * @returns Client-facing direction string.
 */
export function deriveLighterFillDirection(context: {
  isBuy: boolean;
  size: number;
  positionBefore: number;
  signChanged: boolean | undefined;
  pnl: number;
}): string {
  const { isBuy, size, positionBefore, signChanged, pnl } = context;
  if (!Number.isFinite(positionBefore) || signChanged === undefined) {
    return isBuy ? 'Buy' : 'Sell';
  }
  if (positionBefore === 0) {
    return isBuy ? 'Open Long' : 'Open Short';
  }
  if (signChanged) {
    // Crossed past zero → flipped; landed exactly on zero → full close.
    if (size > positionBefore * 1.000001) {
      return isBuy ? 'Short > Long' : 'Long > Short';
    }
    return isBuy ? 'Close Short' : 'Close Long';
  }
  // Partial fill on an existing position: realized pnl proves it reduced.
  if (pnl !== 0) {
    return isBuy ? 'Close Short' : 'Close Long';
  }
  // Zero-pnl partial with no sign change is genuinely ambiguous from this
  // payload (a break-even partial close and an add both fit): fall back to
  // the side-only vocabulary instead of asserting Open without evidence.
  return isBuy ? 'Buy' : 'Sell';
}

export function adaptFillFromLighterTrade(
  trade: LighterRestTrade | LighterWsTrade,
  symbol: string,
  accountIndex: number,
): OrderFill {
  const accountIsAsk = trade.askAccountId === accountIndex;
  // Our side's role decides which fee applies; the venue includes the fee
  // fields only when nonzero (zero is the current standard-account truth).
  const accountIsMaker =
    trade.isMakerAsk === undefined
      ? undefined
      : accountIsAsk === trade.isMakerAsk;
  // Standard accounts (the only supported type — the provider gates
  // Premium at account resolution) pay zero fees, so zero is venue truth.
  // A PRESENT nonzero fee ON OUR SIDE contradicts that gate and its wire
  // unit is unverified: refusing loudly beats silently coercing a real fee
  // to $0. The counterparty's fee is irrelevant — a Standard user trading
  // against a Premium account must keep their valid fill.
  let ourFee: number | string | undefined;
  if (accountIsMaker !== undefined) {
    ourFee = accountIsMaker ? trade.makerFee : trade.takerFee;
  }
  const ourFeeNumeric =
    typeof ourFee === 'number' ? ourFee : parseFloat(ourFee ?? '0');
  if (Number.isFinite(ourFeeNumeric) && ourFeeNumeric !== 0) {
    throw new Error(
      `${LIGHTER_UNSUPPORTED_CAPABILITY_PREFIX} nonzero fee in trade ${trade.tradeId}: fee unit is unverified`,
    );
  }
  const fee = '0';
  const pnl = (accountIsAsk ? trade.askAccountPnl : trade.bidAccountPnl) ?? '0';
  const isBuy = !accountIsAsk;
  // Without isMakerAsk our maker/taker role is unknown — never guess which
  // side's position context applies; fall back to the neutral side-only
  // vocabulary instead of deriving lifecycle from the wrong side.
  let positionBefore = NaN;
  let signChanged: boolean | undefined;
  if (accountIsMaker !== undefined) {
    positionBefore = parseFloat(
      (accountIsMaker
        ? trade.makerPositionSizeBefore
        : trade.takerPositionSizeBefore) ?? '',
    );
    signChanged = accountIsMaker
      ? trade.makerPositionSignChanged
      : trade.takerPositionSignChanged;
  }
  const direction = deriveLighterFillDirection({
    isBuy,
    size: parseFloat(trade.size),
    positionBefore,
    signChanged,
    pnl: parseFloat(pnl),
  });
  // Signed pre-trade position, derivable whenever the direction proved the
  // orientation: closing/flipping a long means it was +before, a short
  // -before; opens start from zero. Clients size flip displays from this.
  let startPosition: string | undefined;
  if (direction.startsWith('Open')) {
    startPosition = '0';
  } else if (direction === 'Close Long' || direction === 'Long > Short') {
    startPosition = String(positionBefore);
  } else if (direction === 'Close Short' || direction === 'Short > Long') {
    startPosition = String(-positionBefore);
  }
  return {
    orderId: String(accountIsAsk ? trade.askId : trade.bidId),
    symbol,
    side: accountIsAsk ? 'sell' : 'buy',
    size: trade.size,
    price: trade.price,
    // The venue reports realized pnl per side of the trade.
    pnl,
    direction,
    ...(startPosition === undefined ? {} : { startPosition }),
    fee,
    feeToken: 'USDC',
    timestamp: trade.timestamp,
    // Lets clients apply venue-specific presentation rules (e.g. the
    // ambiguous side-only vocabulary) without guessing the source.
    providerId: 'lighter',
  };
}

// ============================================================================
// Position Transformation
// ============================================================================

/**
 * Transform a Lighter account position into canonical Position.
 *
 * @param position - Position entry from an account payload.
 * @param maxLeverage - Per-market max leverage (venue margin fractions).
 * @returns MetaMask Perps API position object.
 */
export function adaptPositionFromLighter(
  position: LighterApiPosition,
  maxLeverage: number = LIGHTER_MAX_LEVERAGE,
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
    maxLeverage,
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
    isTrigger: !['market', 'limit'].includes(order.type),
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
