import type {
  StateMetadata,
  ControllerStateChangeEvent,
  ControllerGetStateAction,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';

import {
  AiDigestControllerErrorMessage,
  controllerName,
  CACHE_DURATION_MS,
  MAX_CACHE_ENTRIES,
} from './ai-digest-constants';
import type {
  AiDigestControllerState,
  DigestService,
  MarketInsightsReport,
  MarketInsightsEntry,
  MarketOverview,
  MarketOverviewEntry,
} from './ai-digest-types';
import type { AiDigestControllerMethodActions } from './AiDigestController-method-action-types';

export type AiDigestControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  AiDigestControllerState
>;

export type AiDigestControllerActions =
  | AiDigestControllerGetStateAction
  | AiDigestControllerMethodActions;

export type AiDigestControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  AiDigestControllerState
>;

export type AiDigestControllerEvents = AiDigestControllerStateChangeEvent;

export type AiDigestControllerMessenger = Messenger<
  typeof controllerName,
  AiDigestControllerActions,
  AiDigestControllerEvents
>;

export type AiDigestControllerOptions = {
  messenger: AiDigestControllerMessenger;
  state?: Partial<AiDigestControllerState>;
  digestService: DigestService;
};

export function getDefaultAiDigestControllerState(): AiDigestControllerState {
  return {
    marketInsights: {},
    marketOverview: null,
  };
}

const aiDigestControllerMetadata: StateMetadata<AiDigestControllerState> = {
  marketInsights: {
    persist: true,
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    usedInUi: true,
  },
  marketOverview: {
    persist: true,
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    usedInUi: true,
  },
};

const MESSENGER_EXPOSED_METHODS = [
  'fetchMarketInsights',
  'fetchMarketOverview',
] as const;

export class AiDigestController extends BaseController<
  typeof controllerName,
  AiDigestControllerState,
  AiDigestControllerMessenger
> {
  readonly #digestService: DigestService;

  constructor({ messenger, state, digestService }: AiDigestControllerOptions) {
    super({
      name: controllerName,
      metadata: aiDigestControllerMetadata,
      state: {
        ...getDefaultAiDigestControllerState(),
        ...state,
      },
      messenger,
    });

    this.#digestService = digestService;
    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Fetches market insights for a given asset identifier.
   * Returns cached data if still fresh, otherwise calls the service.
   *
   * Accepts either a CAIP-19 asset type (e.g. `eip155:1/slip44:60`) or a perps
   * market symbol (e.g. `ETH`). The service handles choosing the correct API
   * query parameter automatically.
   *
   * @param assetIdentifier - The asset identifier (CAIP-19 ID or perps market symbol).
   * @returns The market insights report, or `null` if none exists.
   */
  async fetchMarketInsights(
    assetIdentifier: string,
  ): Promise<MarketInsightsReport | null> {
    if (!assetIdentifier) {
      throw new Error(AiDigestControllerErrorMessage.INVALID_ASSET_IDENTIFIER);
    }

    const existing = this.state.marketInsights[assetIdentifier];
    if (existing) {
      const age = Date.now() - existing.fetchedAt;
      if (age < CACHE_DURATION_MS) {
        return existing.data;
      }
    }

    const data = await this.#digestService.searchDigest(assetIdentifier);

    if (data === null) {
      // No insights available for this asset — clear any stale cache entry
      this.update((state) => {
        delete state.marketInsights[assetIdentifier];
      });
      return null;
    }

    const entry: MarketInsightsEntry = {
      assetIdentifier,
      fetchedAt: Date.now(),
      data,
    };

    this.update((state) => {
      state.marketInsights[assetIdentifier] = entry;
      this.#evictStaleCachedEntries(state.marketInsights);
    });

    return data;
  }

  /**
   * Fetches the market overview report.
   * Returns cached data if still fresh, otherwise calls the service.
   *
   * @returns The market overview report, or `null` if none exists.
   */
  async fetchMarketOverview(): Promise<MarketOverview | null> {
    const existing = this.state.marketOverview;
    if (existing) {
      const age = Date.now() - existing.fetchedAt;
      if (age < CACHE_DURATION_MS) {
        return existing.data;
      }
    }

    const data = await this.#digestService.fetchMarketOverview();

    if (data === null) {
      this.update((state) => {
        state.marketOverview = null;
      });
      return null;
    }

    const entry: MarketOverviewEntry = {
      fetchedAt: Date.now(),
      data,
    };

    this.update((state) => {
      state.marketOverview = entry;
    });

    return data;
  }

  /**
   * Evicts stale (TTL expired) and oldest entries (FIFO) if cache exceeds max size.
   *
   * @param cache - The cache record to evict entries from.
   */
  #evictStaleCachedEntries<EntryType extends { fetchedAt: number }>(
    cache: Record<string, EntryType>,
  ): void {
    const now = Date.now();
    const entries = Object.entries(cache);
    const keysToDelete: string[] = [];
    const freshEntries: [string, EntryType][] = [];

    for (const [key, entry] of entries) {
      if (now - entry.fetchedAt >= CACHE_DURATION_MS) {
        keysToDelete.push(key);
      } else {
        freshEntries.push([key, entry]);
      }
    }

    if (freshEntries.length > MAX_CACHE_ENTRIES) {
      freshEntries.sort((a, b) => a[1].fetchedAt - b[1].fetchedAt);
      const entriesToRemove = freshEntries.length - MAX_CACHE_ENTRIES;
      for (let i = 0; i < entriesToRemove; i++) {
        keysToDelete.push(freshEntries[i][0]);
      }
    }

    for (const key of keysToDelete) {
      delete cache[key];
    }
  }
}
