/**
 * Subscribes the price-fetch set when the Price API marks it `wssSupport`.
 *
 * That set is balances and custom assets on the selected accounts and chains,
 * minus hidden assets. This stream sends that set, under one caller name, on
 * every reconcile. `MarketStatsService` remembers the callers on each channel,
 * so a screen watching the same asset keeps its quote. The price poll is
 * unchanged: it still fetches every tracked asset. When MarketStatsService is
 * not wired, the poll is the only price source.
 */

import type {
  MarketStatsServiceActions,
  SupportedCurrency,
} from '@metamask/core-backend';
import type { Messenger } from '@metamask/messenger';

import { createModuleLogger, projectLogger } from '../logger.js';
import type { Caip19AssetId } from '../types.js';
import { normalizeAssetId } from '../utils/index.js';

const log = createModuleLogger(projectLogger, 'MarketStatsPriceStream');

export type MarketStatsPriceStreamMessenger = Messenger<
  string,
  MarketStatsServiceActions,
  never
>;

export type StreamCandidate = {
  assetId: Caip19AssetId;
  wssSupport: boolean;
};

export type MarketStatsPriceStreamOptions = {
  messenger: MarketStatsPriceStreamMessenger;
  getSelectedCurrency: () => SupportedCurrency;
};

/**
 * Read `wssSupport` off a spot-price entry.
 *
 * @param data - One asset's `/v3/spot-prices` entry.
 * @returns Whether the asset can stream.
 */
export function readSpotPriceStreamEligibility(data: object): boolean {
  return (data as { wssSupport?: unknown }).wssSupport === true;
}

/**
 * Assets the Price API marks as streamable.
 *
 * @param candidates - Assets learned from the latest spot-price response.
 * @returns Asset ids to subscribe.
 */
export function selectAssetsToStream(
  candidates: StreamCandidate[],
): Caip19AssetId[] {
  return candidates
    .filter((candidate) => candidate.wssSupport)
    .map((candidate) => candidate.assetId);
}

/**
 * True when the messenger has no MarketStatsService handler.
 * Price updates then stay on the poll.
 *
 * @param error - Failure from `messenger.call`.
 * @returns Whether streaming cannot be used in this process.
 */
export function isMarketStatsUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('has not been registered') ||
    message.includes('has not been delegated')
  );
}

function canonicalAssetId(assetId: string): string {
  try {
    return normalizeAssetId(assetId as Caip19AssetId);
  } catch {
    return assetId;
  }
}

/**
 * Caller name this stream passes to `MarketStatsService.subscribe`.
 * The service replaces this caller's channels with the list from each reconcile.
 */
export const MARKET_STATS_PRICE_STREAM_CALLER = 'assets-controller';

/**
 * Opens market-stats channels for the price-fetch set.
 */
export class MarketStatsPriceStream {
  readonly #messenger: MarketStatsPriceStreamMessenger;

  readonly #getSelectedCurrency: () => SupportedCurrency;

  constructor(options: MarketStatsPriceStreamOptions) {
    this.#messenger = options.messenger;
    this.#getSelectedCurrency = options.getSelectedCurrency;
  }

  /**
   * Send the streamable price-fetch assets as this stream's channels.
   * Assets that left the set are dropped by the service, because this call
   * replaces the previous list for {@link MARKET_STATS_PRICE_STREAM_CALLER}.
   *
   * @param candidates - Price-fetch assets in the current subscription scope.
   */
  async reconcile(candidates: StreamCandidate[]): Promise<void> {
    const currency = this.#getSelectedCurrency();
    const subscriptions = selectAssetsToStream(candidates).map((assetId) => ({
      assetId: canonicalAssetId(assetId),
      currency,
    }));
    await this.#send(subscriptions);
  }

  /**
   * Drop every channel this stream subscribed.
   * Used when the selected currency changes, and when the price subscription ends.
   */
  async releaseSubscriptions(): Promise<void> {
    await this.#send([]);
  }

  /**
   * Drop channels this stream subscribed.
   */
  destroy(): void {
    this.releaseSubscriptions().catch(() => {
      // destroy is sync; a failed unsubscribe is already logged
    });
  }

  async #send(
    subscriptions: { assetId: string; currency: string }[],
  ): Promise<void> {
    try {
      await this.#messenger.call(
        'MarketStatsService:subscribe',
        subscriptions,
        MARKET_STATS_PRICE_STREAM_CALLER,
      );
    } catch (error) {
      if (isMarketStatsUnavailable(error)) {
        log('Market stats stream is not available; polling prices');
        return;
      }
      log(
        'Market stats subscribe failed; polling assets the service did not open',
        { error },
      );
    }
  }
}
