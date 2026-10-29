/**
 * Streams spot prices for assets the Price API marks `wssSupport`, and tells
 * PriceDataSource which assets still need the poll.
 *
 * A chain reported down is polled (after a short jitter) until it recovers.
 * Assets without streaming support, and assets past the 200-channel cap, stay
 * on the poll. When MarketStatsService is not wired, every asset is polled.
 */

import type {
  MarketStatsPriceUpdate,
  MarketStatsServiceActions,
  MarketStatsServiceChainStatusChangedEvent,
  MarketStatsServicePricesUpdatedEvent,
  SupportedCurrency,
} from '@metamask/core-backend';
import { MARKET_STATS_MAX_CHANNELS } from '@metamask/core-backend';
import type { Messenger } from '@metamask/messenger';
import { parseCaipAssetType } from '@metamask/utils';

import { createModuleLogger, projectLogger } from '../logger.js';
import type {
  AssetsControllerState,
  Caip19AssetId,
  FungibleAssetPrice,
} from '../types.js';
import { normalizeAssetId } from '../utils/index.js';

const log = createModuleLogger(projectLogger, 'MarketStatsPriceStream');

/** Cap on the random delay before a chain-down poll, to avoid a thundering herd. */
const MAX_FALLBACK_JITTER_MS = 5_000;

export type MarketStatsPriceStreamMessenger = Messenger<
  string,
  MarketStatsServiceActions,
  | MarketStatsServicePricesUpdatedEvent
  | MarketStatsServiceChainStatusChangedEvent
>;

export type StreamCandidate = {
  assetId: Caip19AssetId;
  wssSupport: boolean;
  totalVolume: number;
};

type SubscribedAsset = {
  assetId: Caip19AssetId;
  currency: string;
};

export type MarketStatsPriceStreamOptions = {
  messenger: MarketStatsPriceStreamMessenger;
  getSelectedCurrency: () => SupportedCurrency;
  getAssetsState: () => AssetsControllerState;
  getPollIntervalMs: () => number;
  onPrices: (
    prices: Record<Caip19AssetId, FungibleAssetPrice>,
  ) => void | Promise<void>;
  requestPoll: (
    delayMs: number,
    details: { chainIds: string[]; status: 'up' | 'down' },
  ) => void;
  /** Defaults to Math.random. Tests inject a fixed value. */
  random?: () => number;
  /** Defaults to {@link MARKET_STATS_MAX_CHANNELS}. */
  maxChannels?: number;
};

/**
 * Read `wssSupport` and 24h volume off a spot-price entry.
 *
 * @param data - One asset's `/v3/spot-prices` entry.
 * @returns Whether the asset can stream, and its volume (0 when missing).
 */
export function readSpotPriceStreamEligibility(data: object): {
  wssSupport: boolean;
  totalVolume: number;
} {
  const record = data as { wssSupport?: unknown; totalVolume?: unknown };
  const totalVolume =
    typeof record.totalVolume === 'number' &&
    Number.isFinite(record.totalVolume)
      ? record.totalVolume
      : 0;
  return {
    wssSupport: record.wssSupport === true,
    totalVolume,
  };
}

/**
 * Highest-volume streamable assets, capped at `maxChannels`.
 * Ties break by asset id so the choice is stable.
 *
 * @param candidates - Assets learned from the latest spot-price response.
 * @param maxChannels - Session channel cap.
 * @returns Asset ids to subscribe.
 */
export function selectAssetsToStream(
  candidates: StreamCandidate[],
  maxChannels: number,
): Caip19AssetId[] {
  return [...candidates]
    .filter((candidate) => candidate.wssSupport)
    .sort((a, b) => {
      if (a.totalVolume !== b.totalVolume) {
        return b.totalVolume - a.totalVolume;
      }
      if (a.assetId < b.assetId) {
        return -1;
      }
      if (a.assetId > b.assetId) {
        return 1;
      }
      return 0;
    })
    .slice(0, maxChannels)
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

/**
 * Holds the market-stats subscription set for PriceDataSource.
 */
export class MarketStatsPriceStream {
  readonly #messenger: MarketStatsPriceStreamMessenger;

  readonly #getSelectedCurrency: () => SupportedCurrency;

  readonly #getAssetsState: () => AssetsControllerState;

  readonly #getPollIntervalMs: () => number;

  readonly #onPrices: MarketStatsPriceStreamOptions['onPrices'];

  readonly #requestPoll: MarketStatsPriceStreamOptions['requestPoll'];

  readonly #random: () => number;

  readonly #maxChannels: number;

  readonly #onPricesUpdated: (payload: {
    updates: MarketStatsPriceUpdate[];
    timestamp?: number;
  }) => void;

  readonly #onChainStatus: (payload: {
    chainIds: string[];
    status: 'up' | 'down';
    timestamp?: number;
  }) => void;

  /** null until the first subscribe attempt. false when the service is unwired. */
  #enabled: boolean | null = null;

  #hasSynced = false;

  readonly #subscribed = new Map<Caip19AssetId, SubscribedAsset>();

  readonly #chainsDown = new Set<string>();

  readonly #pollNotBefore = new Map<string, number>();

  #lock: Promise<void> = Promise.resolve();

  constructor(options: MarketStatsPriceStreamOptions) {
    this.#messenger = options.messenger;
    this.#getSelectedCurrency = options.getSelectedCurrency;
    this.#getAssetsState = options.getAssetsState;
    this.#getPollIntervalMs = options.getPollIntervalMs;
    this.#onPrices = options.onPrices;
    this.#requestPoll = options.requestPoll;
    this.#random = options.random ?? Math.random;
    this.#maxChannels = options.maxChannels ?? MARKET_STATS_MAX_CHANNELS;

    this.#onPricesUpdated = (payload): void => {
      this.#handlePrices(payload).catch((error: unknown) => {
        log('Failed to apply market-stats prices', { error });
      });
    };
    this.#onChainStatus = (payload): void => {
      this.#handleChainStatus(payload);
    };

    this.#messenger.subscribe(
      'MarketStatsService:pricesUpdated',
      this.#onPricesUpdated,
    );
    this.#messenger.subscribe(
      'MarketStatsService:chainStatusChanged',
      this.#onChainStatus,
    );
  }

  /**
   * True after the first reconcile, including the case where streaming is unavailable.
   *
   * @returns Whether the first reconcile has finished.
   */
  get hasSynced(): boolean {
    return this.#hasSynced;
  }

  /**
   * Whether this asset should be priced from `/v3/spot-prices` on the poll.
   * Down chains are skipped until their jitter window ends, then polled.
   *
   * @param assetId - CAIP-19 asset id.
   * @param now - Current time in ms.
   * @returns True when the poll should fetch this asset.
   */
  shouldPoll(assetId: Caip19AssetId, now: number): boolean {
    if (this.#enabled === false) {
      return true;
    }

    const chainId = chainIdFromAssetId(assetId);
    if (chainId && (this.#pollNotBefore.get(chainId) ?? 0) > now) {
      return false;
    }
    if (chainId && this.#chainsDown.has(chainId)) {
      return true;
    }
    return !this.#subscribed.has(assetId);
  }

  /**
   * Subscribe the streamable subset and drop channels that are no longer wanted.
   *
   * @param candidates - Assets in the current subscription scope.
   */
  async reconcile(candidates: StreamCandidate[]): Promise<void> {
    await this.#withLock(async () => {
      if (this.#enabled === false) {
        this.#hasSynced = true;
        return;
      }

      const currency = this.#getSelectedCurrency();
      const desired = new Set(
        selectAssetsToStream(candidates, this.#maxChannels),
      );

      for (const [assetId, info] of this.#subscribed) {
        if (info.currency !== currency || !desired.has(assetId)) {
          await this.#unsubscribe(info);
          this.#subscribed.delete(assetId);
        }
      }

      for (const assetId of desired) {
        if (this.#subscribed.has(assetId)) {
          continue;
        }
        try {
          await this.#messenger.call('MarketStatsService:subscribe', {
            assetId,
            currency,
          });
          this.#subscribed.set(assetId, { assetId, currency });
          this.#enabled = true;
        } catch (error) {
          if (isMarketStatsUnavailable(error)) {
            log('Market stats stream is not available; polling prices');
            this.#enabled = false;
            await this.#dropSubscribed();
            break;
          }
          log('Market stats subscribe failed; polling this asset', {
            assetId,
            error,
          });
        }
      }

      this.#hasSynced = true;
    });
  }

  /**
   * Unsubscribe every open channel. Listeners stay so a later reconcile can resume.
   */
  async releaseSubscriptions(): Promise<void> {
    await this.#withLock(async () => {
      await this.#dropSubscribed();
    });
  }

  /**
   * Remove listeners and unsubscribe open channels.
   */
  destroy(): void {
    this.#messenger.unsubscribe(
      'MarketStatsService:pricesUpdated',
      this.#onPricesUpdated,
    );
    this.#messenger.unsubscribe(
      'MarketStatsService:chainStatusChanged',
      this.#onChainStatus,
    );
    const open = [...this.#subscribed.values()];
    this.#subscribed.clear();
    for (const info of open) {
      this.#unsubscribe(info).catch(() => {
        // destroy is sync; a failed unsubscribe is already logged
      });
    }
  }

  async #dropSubscribed(): Promise<void> {
    const open = [...this.#subscribed.values()];
    this.#subscribed.clear();
    for (const info of open) {
      await this.#unsubscribe(info);
    }
  }

  async #unsubscribe(info: SubscribedAsset): Promise<void> {
    try {
      await this.#messenger.call('MarketStatsService:unsubscribe', {
        assetId: info.assetId,
        currency: info.currency,
      });
    } catch (error) {
      log('Market stats unsubscribe failed', {
        assetId: info.assetId,
        error,
      });
    }
  }

  async #handlePrices(payload: {
    updates: MarketStatsPriceUpdate[];
    timestamp?: number;
  }): Promise<void> {
    const currency = this.#getSelectedCurrency().toLowerCase();
    const { assetsPrice } = this.#getAssetsState();
    const lastUpdated = payload.timestamp ?? Date.now();
    const prices: Record<Caip19AssetId, FungibleAssetPrice> = {};

    for (const update of payload.updates) {
      if (update.currency.toLowerCase() !== currency) {
        continue;
      }

      let assetId: Caip19AssetId;
      try {
        assetId = normalizeAssetId(update.assetId as Caip19AssetId);
      } catch {
        continue;
      }

      if (!this.#subscribed.has(assetId)) {
        continue;
      }

      const chainId = chainIdFromAssetId(assetId);
      if (chainId && this.#chainsDown.has(chainId)) {
        continue;
      }

      const existing = assetsPrice?.[assetId];
      const existingFungible =
        existing?.assetPriceType === 'fungible' ? existing : undefined;
      if (!existingFungible && currency !== 'usd') {
        continue;
      }

      const next: FungibleAssetPrice = {
        ...(existingFungible ?? {
          assetPriceType: 'fungible',
          usdPrice: update.price,
        }),
        price: update.price,
        lastUpdated,
      };
      if (currency === 'usd') {
        next.usdPrice = update.price;
      }
      if (typeof update.pricePercentChange1d === 'number') {
        next.pricePercentChange1d = update.pricePercentChange1d;
      }
      prices[assetId] = next;
    }

    if (Object.keys(prices).length === 0) {
      return;
    }

    await this.#onPrices(prices);
  }

  #handleChainStatus(payload: {
    chainIds: string[];
    status: 'up' | 'down';
  }): void {
    if (this.#enabled === false) {
      return;
    }

    if (payload.status === 'down') {
      const jitter = fallbackJitterMs(this.#getPollIntervalMs(), this.#random);
      const notBefore = Date.now() + jitter;
      for (const chainId of payload.chainIds) {
        this.#chainsDown.add(chainId);
        this.#pollNotBefore.set(chainId, notBefore);
      }
      this.#requestPoll(jitter, {
        chainIds: payload.chainIds,
        status: 'down',
      });
      return;
    }

    for (const chainId of payload.chainIds) {
      this.#chainsDown.delete(chainId);
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
