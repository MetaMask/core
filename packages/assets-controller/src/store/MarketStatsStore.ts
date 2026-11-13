/**
 * Quote cache for `MarketStatsService:pricesUpdated`.
 *
 * The UI holds one instance. A tick updates this object and does not write
 * `AssetsController` state, so it does not persist and does not notify the
 * controller. Polled prices stay in `assetsPrice` and show when this map has
 * no quote.
 */

import { isCaipAssetType, parseCaipAssetType } from '@metamask/utils';

import { safeNormalizeAssetId } from '../utils/index.js';

export type LiveQuote = {
  price: number;
  pricePercentChange1d?: number;
};

export type LivePriceMap = ReadonlyMap<string, LiveQuote>;

/**
 * Key a market-stats asset id the same way on the tick and on the lookup.
 * EVM ERC-20 addresses are checksummed. Anything else is kept as given.
 *
 * @param assetId - CAIP-19 asset id, or any other string the caller uses as a key.
 * @returns The map key.
 */
export function marketStatsAssetKey(assetId: string): string {
  if (!isCaipAssetType(assetId)) {
    return assetId;
  }
  return safeNormalizeAssetId(assetId);
}

/**
 * Quote for one asset. The id is keyed with {@link marketStatsAssetKey}.
 *
 * @param quotes - Current quote map.
 * @param assetId - CAIP-19 asset id.
 * @returns The streamed quote, or undefined.
 */
export function readLiveQuote(
  quotes: LivePriceMap,
  assetId: string | undefined,
): LiveQuote | undefined {
  if (!assetId) {
    return undefined;
  }
  return quotes.get(marketStatsAssetKey(assetId));
}

function readFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value !== 'string' || value.trim() === '') {
    return undefined;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Latest market-stats quotes for one currency.
 */
export class MarketStatsStore {
  #currency = 'usd';

  #quotes: LivePriceMap = new Map<string, LiveQuote>();

  readonly #listeners = new Set<() => void>();

  /**
   * Stable reference so `useSyncExternalStore` can take it directly.
   *
   * @returns The current quote map. The same reference until a tick changes it.
   */
  readonly getSnapshot = (): LivePriceMap => this.#quotes;

  /**
   * @param listener - Called after the quote map changes.
   * @returns Unsubscribe.
   */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  /**
   * Remember the selected currency and drop quotes from the previous one.
   * Does not notify. Callers invoke this during render, and the currency
   * selector is what re-renders every reader. That render already reads the
   * empty map.
   *
   * @param currency - Selected currency. Case is ignored.
   */
  setCurrency(currency: string): void {
    const next = currency.toLowerCase();
    if (this.#currency === next) {
      return;
    }
    this.#currency = next;
    if (this.#quotes.size === 0) {
      return;
    }
    this.#quotes = new Map();
  }

  /**
   * Merge one `MarketStatsService:pricesUpdated` payload.
   * Entries in another currency are ignored. The argument is the object
   * passed to `publish`. The extension unwraps its forwarded argument list
   * before calling this.
   *
   * @param payload - Published `{ updates }` object.
   */
  ingestPrices(payload: unknown): void {
    if (!isRecord(payload) || !isUnknownArray(payload.updates)) {
      return;
    }

    let changed = false;
    const updated = new Map(this.#quotes);
    for (const entry of payload.updates) {
      if (!isRecord(entry)) {
        continue;
      }
      const { assetId, currency } = entry;
      if (
        typeof assetId !== 'string' ||
        assetId.length === 0 ||
        typeof currency !== 'string' ||
        currency.toLowerCase() !== this.#currency
      ) {
        continue;
      }
      const price = readFiniteNumber(entry.price);
      if (price === undefined) {
        continue;
      }
      const pricePercentChange1d = readFiniteNumber(entry.pricePercentChange1d);
      const key = marketStatsAssetKey(assetId);
      const previous = updated.get(key);
      if (
        previous?.price === price &&
        previous.pricePercentChange1d === pricePercentChange1d
      ) {
        continue;
      }
      updated.set(
        key,
        pricePercentChange1d === undefined
          ? { price }
          : { price, pricePercentChange1d },
      );
      changed = true;
    }
    if (!changed) {
      return;
    }
    this.#replace(updated);
  }

  /**
   * A chain reported down leaves the map so the polled price shows until the
   * next tick for that chain.
   *
   * @param payload - Published `MarketStatsService:chainStatusChanged` object.
   */
  ingestChainStatus(payload: unknown): void {
    if (!isRecord(payload)) {
      return;
    }
    const { chainIds } = payload;
    if (payload.status !== 'down' || !isUnknownArray(chainIds)) {
      return;
    }
    if (this.#quotes.size === 0) {
      return;
    }

    const down = new Set(
      chainIds.filter(
        (chainId): chainId is string => typeof chainId === 'string',
      ),
    );
    let changed = false;
    const updated = new Map(this.#quotes);
    for (const key of updated.keys()) {
      if (!isCaipAssetType(key)) {
        continue;
      }
      if (down.has(parseCaipAssetType(key).chainId)) {
        updated.delete(key);
        changed = true;
      }
    }
    if (!changed) {
      return;
    }
    this.#replace(updated);
  }

  #replace(quotes: Map<string, LiveQuote>): void {
    this.#quotes = quotes;
    for (const listener of this.#listeners) {
      listener();
    }
  }
}
