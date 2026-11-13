/**
 * Subscribes the price-fetch set when the Price API marks it `wssSupport`.
 *
 * That set is balances and custom assets on the selected accounts and chains,
 * minus hidden assets. Open channels live on MarketStatsService. Reconcile
 * reads `getSubscriptions`. A subscribe that does not open is retried on the
 * next reconcile, and those assets stay on the poll. Chain health is read
 * from `getChainStatuses`. A chain reported down is polled after a short
 * jitter until it recovers. When MarketStatsService is not wired, every
 * asset is polled.
 */

import type {
  MarketStatsServiceActions,
  MarketStatsServiceChainStatusChangedEvent,
  SupportedCurrency,
} from '@metamask/core-backend';
import type { Messenger } from '@metamask/messenger';
import { parseCaipAssetType } from '@metamask/utils';

import { createModuleLogger, projectLogger } from '../logger.js';
import type { Caip19AssetId } from '../types.js';
import { normalizeAssetId } from '../utils/index.js';

const log = createModuleLogger(projectLogger, 'MarketStatsPriceStream');

/** Cap on the random delay before a chain-down poll, to avoid a thundering herd. */
const MAX_FALLBACK_JITTER_MS = 5_000;

export type MarketStatsPriceStreamMessenger = Messenger<
  string,
  MarketStatsServiceActions,
  MarketStatsServiceChainStatusChangedEvent
>;

export type StreamCandidate = {
  assetId: Caip19AssetId;
  wssSupport: boolean;
};

type MarketStatsSubscription = {
  assetId: string;
  currency: string;
};

export type MarketStatsPriceStreamOptions = {
  messenger: MarketStatsPriceStreamMessenger;
  getSelectedCurrency: () => SupportedCurrency;
  getPollIntervalMs: () => number;
  requestPoll: (
    delayMs: number,
    details: { chainIds: string[]; status: 'up' | 'down' },
  ) => void;
  /** Defaults to Math.random. Tests inject a fixed value. */
  random?: () => number;
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
 * CAIP-2 chain id from a CAIP-19 asset id, or undefined when the id is invalid.
 *
 * @param assetId - CAIP-19 asset identifier.
 * @returns The chain id.
 */
export function chainIdFromAssetId(assetId: string): string | undefined {
  try {
    return parseCaipAssetType(assetId as Caip19AssetId).chainId;
  } catch {
    return undefined;
  }
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

export function fallbackJitterMs(
  pollIntervalMs: number,
  random: () => number,
): number {
  const cap = Math.min(Math.max(pollIntervalMs, 0), MAX_FALLBACK_JITTER_MS);
  if (cap === 0) {
    return 0;
  }
  return Math.floor(random() * cap);
}

function canonicalAssetId(assetId: string): string {
  try {
    return normalizeAssetId(assetId as Caip19AssetId);
  } catch {
    return assetId;
  }
}

/**
 * Opens market-stats channels for the price-fetch set.
 */
export class MarketStatsPriceStream {
  readonly #messenger: MarketStatsPriceStreamMessenger;

  readonly #getSelectedCurrency: () => SupportedCurrency;

  readonly #getPollIntervalMs: () => number;

  readonly #requestPoll: MarketStatsPriceStreamOptions['requestPoll'];

  readonly #random: () => number;

  readonly #onChainStatus: (payload: {
    chainIds: string[];
    status: 'up' | 'down';
    timestamp?: number;
  }) => void;

  /**
   * Asset ids from the last reconcile. An id that leaves this set is
   * unsubscribed. Channels opened outside the price-fetch set are left open.
   */
  #pricedAssetIds = new Set<string>();

  readonly #pollNotBefore = new Map<string, number>();

  #lock: Promise<void> = Promise.resolve();

  constructor(options: MarketStatsPriceStreamOptions) {
    this.#messenger = options.messenger;
    this.#getSelectedCurrency = options.getSelectedCurrency;
    this.#getPollIntervalMs = options.getPollIntervalMs;
    this.#requestPoll = options.requestPoll;
    this.#random = options.random ?? Math.random;

    this.#onChainStatus = (payload): void => {
      this.#handleChainStatus(payload);
    };

    this.#messenger.subscribe(
      'MarketStatsService:chainStatusChanged',
      this.#onChainStatus,
    );
  }

  /**
   * Asset ids with an open market-stats channel for the selected currency.
   *
   * @returns Ids the service currently has open. Empty when streaming is off.
   */
  async subscribedAssetIds(): Promise<ReadonlySet<string>> {
    const currency = this.#getSelectedCurrency().toLowerCase();
    const subscriptions = await this.#readSubscriptions();
    if (!subscriptions) {
      return new Set();
    }
    return new Set(
      subscriptions
        .filter(
          (subscription) => subscription.currency.toLowerCase() === currency,
        )
        .map((subscription) => canonicalAssetId(subscription.assetId)),
    );
  }

  /**
   * Chain ids `getChainStatuses` currently reports as down.
   * Empty when MarketStatsService is not registered.
   *
   * @returns Down chain ids.
   */
  async downChainIds(): Promise<ReadonlySet<string>> {
    const statuses = await this.#readChainStatuses();
    if (!statuses) {
      return new Set();
    }
    return new Set(
      statuses
        .filter((entry) => entry.status === 'down')
        .map((entry) => entry.chainId),
    );
  }

  /**
   * Whether this asset should be priced from `/v3/spot-prices` on the poll.
   * Down chains are skipped until their jitter window ends, then polled.
   *
   * @param assetId - CAIP-19 asset id.
   * @param now - Current time in ms.
   * @param subscribed - Asset ids `getSubscriptions` currently has open.
   * @param downChains - Chain ids `getChainStatuses` reports as down.
   * @returns True when the poll should fetch this asset.
   */
  shouldPoll(
    assetId: Caip19AssetId,
    now: number,
    subscribed: ReadonlySet<string>,
    downChains: ReadonlySet<string>,
  ): boolean {
    const chainId = chainIdFromAssetId(assetId);
    if (chainId && (this.#pollNotBefore.get(chainId) ?? 0) > now) {
      return false;
    }
    if (chainId && downChains.has(chainId)) {
      return true;
    }
    return !subscribed.has(canonicalAssetId(assetId));
  }

  /**
   * Subscribe price-fetch assets marked `wssSupport`.
   * Drop channels for assets that left that set.
   *
   * @param candidates - Price-fetch assets in the current subscription scope.
   */
  async reconcile(candidates: StreamCandidate[]): Promise<void> {
    await this.#withLock(async () => {
      const selectedCurrency = this.#getSelectedCurrency();
      const priced = new Set(
        candidates.map((candidate) => canonicalAssetId(candidate.assetId)),
      );
      const subscribing = selectAssetsToStream(candidates).map((assetId) => ({
        assetId: canonicalAssetId(assetId) as Caip19AssetId,
        currency: selectedCurrency,
      }));

      const current = await this.#readSubscriptions();
      if (!current) {
        return;
      }

      const previous = this.#pricedAssetIds;
      this.#pricedAssetIds = priced;
      await this.#unsubscribe(
        current.filter((subscription) => {
          const assetId = canonicalAssetId(subscription.assetId);
          return previous.has(assetId) && !priced.has(assetId);
        }),
      );
      if (subscribing.length > 0) {
        try {
          await this.#messenger.call(
            'MarketStatsService:subscribe',
            subscribing,
          );
        } catch (error) {
          if (isMarketStatsUnavailable(error)) {
            log('Market stats stream is not available; polling prices');
          } else {
            log(
              'Market stats subscribe failed; polling assets the service did not open',
              { error },
            );
          }
        }
      }
    });
  }

  /**
   * Drop one reference on each open channel for a price-fetch asset.
   * Used when the selected currency changes, and when the price subscription ends.
   */
  async releaseSubscriptions(): Promise<void> {
    await this.#withLock(async () => {
      await this.#releaseOpened();
    });
  }

  /**
   * Remove listeners and drop channels this stream opened.
   */
  destroy(): void {
    this.#messenger.unsubscribe(
      'MarketStatsService:chainStatusChanged',
      this.#onChainStatus,
    );
    this.#releaseOpened().catch(() => {
      // destroy is sync; a failed unsubscribe is already logged
    });
  }

  async #releaseOpened(): Promise<void> {
    if (this.#pricedAssetIds.size === 0) {
      return;
    }
    const current = await this.#readSubscriptions();
    if (!current) {
      return;
    }
    await this.#unsubscribe(
      current.filter((subscription) =>
        this.#pricedAssetIds.has(canonicalAssetId(subscription.assetId)),
      ),
    );
  }

  async #readChainStatuses(): Promise<
    { chainId: string; status: 'up' | 'down' }[] | null
  > {
    try {
      return this.#messenger.call('MarketStatsService:getChainStatuses');
    } catch (error) {
      if (isMarketStatsUnavailable(error)) {
        return null;
      }
      throw error;
    }
  }

  async #readSubscriptions(): Promise<MarketStatsSubscription[] | null> {
    try {
      return this.#messenger.call('MarketStatsService:getSubscriptions');
    } catch (error) {
      if (isMarketStatsUnavailable(error)) {
        log('Market stats stream is not available; polling prices');
        return null;
      }
      throw error;
    }
  }

  async #unsubscribe(open: readonly MarketStatsSubscription[]): Promise<void> {
    if (open.length === 0) {
      return;
    }
    try {
      await this.#messenger.call(
        'MarketStatsService:unsubscribe',
        open.map(({ assetId, currency }) => ({
          assetId: canonicalAssetId(assetId),
          currency,
        })),
      );
    } catch (error) {
      log('Market stats unsubscribe failed', {
        assetIds: open.map((info) => info.assetId),
        error,
      });
    }
  }

  #handleChainStatus(payload: {
    chainIds: string[];
    status: 'up' | 'down';
  }): void {
    if (payload.status === 'down') {
      const jitter = fallbackJitterMs(this.#getPollIntervalMs(), this.#random);
      const notBefore = Date.now() + jitter;
      for (const chainId of payload.chainIds) {
        this.#pollNotBefore.set(chainId, notBefore);
      }
      this.#requestPoll(jitter, {
        chainIds: payload.chainIds,
        status: 'down',
      });
      return;
    }

    for (const chainId of payload.chainIds) {
      this.#pollNotBefore.delete(chainId);
    }
    this.#requestPoll(0, { chainIds: payload.chainIds, status: 'up' });
  }

  async #withLock(fn: () => Promise<void>): Promise<void> {
    const previous = this.#lock;
    let release: () => void = () => undefined;
    this.#lock = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      await fn();
    } finally {
      release();
    }
  }
}
