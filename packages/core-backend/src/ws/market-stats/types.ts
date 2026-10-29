/**
 * market-stats.v1 WebSocket types.
 *
 * Clients subscribe per asset and currency. The gateway delivers price changes
 * as one batch on the top-level `market-stats.v1` channel.
 */

/** Channel type / namespace for market-stats subscriptions. */
export const MARKET_STATS_NAMESPACE = 'market-stats.v1';

/**
 * Channel that carries batched price updates for every subscribed asset.
 * This is not the per-asset subscription channel.
 */
export const MARKET_STATS_BATCH_CHANNEL = MARKET_STATS_NAMESPACE;

/** System-notification channel for market-stats chain health. */
export const MARKET_STATS_SYSTEM_NOTIFICATIONS_CHANNEL = `system-notifications.v1.${MARKET_STATS_NAMESPACE}`;

/**
 * Maximum market-stats.v1 channels per socket session.
 * Assets beyond this stay on the Price API poll. Rank by 24h volume.
 */
export const MARKET_STATS_MAX_CHANNELS = 200;

/**
 * One asset's price inside a market-stats batch.
 */
export type MarketStatsPriceUpdate = {
  /** CAIP-19 asset identifier. */
  assetId: string;
  /** ISO 4217 currency the price is quoted in. */
  currency: string;
  /** Spot price in `currency`. */
  price: number;
  /** 24-hour percentage price change, or null when unavailable. */
  pricePercentChange1d: number | null;
};

/**
 * Options for subscribing to one asset's market-stats channel.
 */
export type MarketStatsSubscriptionOptions = {
  /** CAIP-19 asset identifier, e.g. "eip155:1/slip44:60". */
  assetId: string;
  /** Fiat currency code, e.g. "usd", "eur". */
  currency: string;
};
