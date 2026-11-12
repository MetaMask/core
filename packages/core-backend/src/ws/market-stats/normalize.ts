/**
 * Pure helpers for the market-stats.v1 stream: channel names and batch parsing.
 */

import type { MarketStatsPriceUpdate } from './types.js';
import { MARKET_STATS_NAMESPACE } from './types.js';

/**
 * Build the per-asset market-stats channel.
 *
 * Shape: `market-stats.v1.<assetId>.<currency>`, for example
 * `market-stats.v1.eip155:1/slip44:60.eur`.
 *
 * @param options - Asset and currency to subscribe.
 * @param options.assetId - CAIP-19 asset identifier.
 * @param options.currency - Fiat currency code.
 * @returns The fully-qualified channel name.
 */
export function buildMarketStatsChannel(options: {
  assetId: string;
  currency: string;
}): string {
  return `${MARKET_STATS_NAMESPACE}.${options.assetId}.${options.currency}`;
}

/**
 * Split `market-stats.v1.<assetId>.<currency>` into its asset id and currency.
 *
 * @param channel - Fully-qualified market-stats channel.
 * @returns The asset id and currency, or undefined when the channel is not one.
 */
export function parseMarketStatsChannel(
  channel: string,
): { assetId: string; currency: string } | undefined {
  const prefix = `${MARKET_STATS_NAMESPACE}.`;
  if (!channel.startsWith(prefix)) {
    return undefined;
  }

  const rest = channel.slice(prefix.length);
  const currencyDot = rest.lastIndexOf('.');
  if (currencyDot <= 0 || currencyDot === rest.length - 1) {
    return undefined;
  }

  return {
    assetId: rest.slice(0, currencyDot),
    currency: rest.slice(currencyDot + 1),
  };
}

/**
 * Keep batch entries that have an asset id, currency, and numeric price.
 *
 * @param data - `data` field of a `market-stats.v1` batch message.
 * @returns Parsed updates. Invalid entries are dropped.
 */
export function parseMarketStatsBatch(data: unknown): MarketStatsPriceUpdate[] {
  if (!Array.isArray(data)) {
    return [];
  }

  const updates: MarketStatsPriceUpdate[] = [];
  for (const entry of data) {
    const update = parseMarketStatsUpdate(entry);
    if (update) {
      updates.push(update);
    }
  }
  return updates;
}

function parseMarketStatsUpdate(entry: unknown): MarketStatsPriceUpdate | null {
  if (typeof entry !== 'object' || entry === null) {
    return null;
  }

  const candidate = entry as Partial<MarketStatsPriceUpdate>;
  if (
    typeof candidate.assetId !== 'string' ||
    candidate.assetId.length === 0 ||
    typeof candidate.currency !== 'string' ||
    candidate.currency.length === 0 ||
    typeof candidate.price !== 'number' ||
    !Number.isFinite(candidate.price)
  ) {
    return null;
  }

  const pricePercentChange1d =
    typeof candidate.pricePercentChange1d === 'number' &&
    Number.isFinite(candidate.pricePercentChange1d)
      ? candidate.pricePercentChange1d
      : null;

  return {
    assetId: candidate.assetId,
    currency: candidate.currency,
    price: candidate.price,
    pricePercentChange1d,
  };
}
