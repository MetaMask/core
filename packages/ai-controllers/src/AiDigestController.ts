import type {
  StateMetadata,
  ControllerStateChangeEvent,
  ControllerGetStateAction,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';

import {
  controllerName,
  CACHE_DURATION_MS,
  MAX_CACHE_ENTRIES,
} from './ai-digest-constants';
import type {
  AiDigestControllerState,
  DigestEntry,
  DigestService,
  DigestData,
  MarketInsightsReport,
  MarketInsightsEntry,
} from './ai-digest-types';

export type AiDigestControllerFetchDigestAction = {
  type: `${typeof controllerName}:fetchDigest`;
  handler: AiDigestController['fetchDigest'];
};

export type AiDigestControllerClearDigestAction = {
  type: `${typeof controllerName}:clearDigest`;
  handler: AiDigestController['clearDigest'];
};

export type AiDigestControllerClearAllDigestsAction = {
  type: `${typeof controllerName}:clearAllDigests`;
  handler: AiDigestController['clearAllDigests'];
};

export type AiDigestControllerFetchMarketInsightsAction = {
  type: `${typeof controllerName}:fetchMarketInsights`;
  handler: AiDigestController['fetchMarketInsights'];
};

export type AiDigestControllerClearMarketInsightsAction = {
  type: `${typeof controllerName}:clearMarketInsights`;
  handler: AiDigestController['clearMarketInsights'];
};

export type AiDigestControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  AiDigestControllerState
>;

export type AiDigestControllerActions =
  | AiDigestControllerFetchDigestAction
  | AiDigestControllerClearDigestAction
  | AiDigestControllerClearAllDigestsAction
  | AiDigestControllerFetchMarketInsightsAction
  | AiDigestControllerClearMarketInsightsAction
  | AiDigestControllerGetStateAction;

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
    digests: {},
    marketInsights: {},
  };
}

const aiDigestControllerMetadata: StateMetadata<AiDigestControllerState> = {
  digests: {
    persist: true,
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    usedInUi: true,
  },
  marketInsights: {
    persist: true,
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    usedInUi: true,
  },
};

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
    this.#registerMessageHandlers();
  }

  #registerMessageHandlers(): void {
    this.messenger.registerActionHandler(
      `${controllerName}:fetchDigest`,
      this.fetchDigest.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:clearDigest`,
      this.clearDigest.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:clearAllDigests`,
      this.clearAllDigests.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:fetchMarketInsights`,
      this.fetchMarketInsights.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:clearMarketInsights`,
      this.clearMarketInsights.bind(this),
    );
  }

  async fetchDigest(assetId: string): Promise<DigestData> {
    const existingDigest = this.state.digests[assetId];
    if (existingDigest) {
      const age = Date.now() - existingDigest.fetchedAt;
      if (age < CACHE_DURATION_MS) {
        return existingDigest.data;
      }
    }

    const data = await this.#digestService.fetchDigest(assetId);

    const entry: DigestEntry = {
      asset: assetId,
      fetchedAt: Date.now(),
      data,
    };

    this.update((state) => {
      state.digests[assetId] = entry;
      this.#evictStaleCachedEntries(state.digests);
    });

    return data;
  }

  clearDigest(assetId: string): void {
    this.update((state) => {
      delete state.digests[assetId];
    });
  }

  clearAllDigests(): void {
    this.update((state) => {
      state.digests = {};
    });
  }

  /**
   * Fetches market insights for a given CAIP-19 asset identifier.
   * Returns cached data if still fresh, otherwise calls the service.
   *
   * @param caip19Id - The CAIP-19 identifier of the asset.
   * @returns The market insights report, or `null` if none exists.
   */
  async fetchMarketInsights(
    caip19Id: string,
  ): Promise<MarketInsightsReport | null> {
    const existing = this.state.marketInsights[caip19Id];
    if (existing) {
      const age = Date.now() - existing.fetchedAt;
      if (age < CACHE_DURATION_MS) {
        return existing.data;
      }
    }

    const data = await this.#digestService.searchDigests(caip19Id);

    if (data === null) {
      // No insights available for this asset — clear any stale cache entry
      this.update((state) => {
        delete state.marketInsights[caip19Id];
      });
      return null;
    }

    const entry: MarketInsightsEntry = {
      caip19Id,
      fetchedAt: Date.now(),
      data,
    };

    this.update((state) => {
      state.marketInsights[caip19Id] = entry;
      this.#evictStaleCachedEntries(state.marketInsights);
    });

    return data;
  }

  /**
   * Clears the cached market insights for a specific CAIP-19 asset.
   *
   * @param caip19Id - The CAIP-19 identifier.
   */
  clearMarketInsights(caip19Id: string): void {
    this.update((state) => {
      delete state.marketInsights[caip19Id];
    });
  }

  /**
   * Evicts stale (TTL expired) and oldest entries (FIFO) if cache exceeds max size.
   */
  #evictStaleCachedEntries<T extends { fetchedAt: number }>(
    cache: Record<string, T>,
  ): void {
    const now = Date.now();
    const entries = Object.entries(cache);
    const keysToDelete: string[] = [];
    const freshEntries: [string, T][] = [];

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
