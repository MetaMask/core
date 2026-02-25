import type {
  StateMetadata,
  ControllerStateChangeEvent,
  ControllerGetStateAction,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';
import { isCaipAssetType } from '@metamask/utils';

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
} from './ai-digest-types';

export type AiDigestControllerFetchMarketInsightsAction = {
  type: `${typeof controllerName}:fetchMarketInsights`;
  handler: AiDigestController['fetchMarketInsights'];
};

export type AiDigestControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  AiDigestControllerState
>;

export type AiDigestControllerActions =
  | AiDigestControllerFetchMarketInsightsAction
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
    marketInsights: {},
  };
}

const aiDigestControllerMetadata: StateMetadata<AiDigestControllerState> = {
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
      `${controllerName}:fetchMarketInsights`,
      this.fetchMarketInsights.bind(this),
    );
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
    if (!isCaipAssetType(caip19Id)) {
      throw new Error(AiDigestControllerErrorMessage.INVALID_CAIP_ASSET_TYPE);
    }

    const existing = this.state.marketInsights[caip19Id];
    if (existing) {
      const age = Date.now() - existing.fetchedAt;
      if (age < CACHE_DURATION_MS) {
        return existing.data;
      }
    }

    const data = await this.#digestService.searchDigest(caip19Id);

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
