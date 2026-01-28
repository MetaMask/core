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
import { DIGEST_STATUS } from './ai-digest-types';
import type {
  AiDigestControllerState,
  DigestEntry,
  DigestService,
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

export type AiDigestControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  AiDigestControllerState
>;

export type AiDigestControllerActions =
  | AiDigestControllerFetchDigestAction
  | AiDigestControllerClearDigestAction
  | AiDigestControllerClearAllDigestsAction
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
  };
}

const aiDigestControllerMetadata: StateMetadata<AiDigestControllerState> = {
  digests: {
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
  }

  async fetchDigest(coingeckoSlug: string): Promise<DigestEntry> {
    const existingDigest = this.state.digests[coingeckoSlug];
    if (
      existingDigest?.status === DIGEST_STATUS.SUCCESS &&
      existingDigest.fetchedAt
    ) {
      const age = Date.now() - existingDigest.fetchedAt;
      if (age < CACHE_DURATION_MS) {
        return existingDigest;
      }
    }

    this.update((state) => {
      state.digests[coingeckoSlug] = {
        asset: coingeckoSlug,
        status: DIGEST_STATUS.LOADING,
      };
    });

    try {
      const data = await this.#digestService.fetchDigest(coingeckoSlug);

      const entry: DigestEntry = {
        asset: coingeckoSlug,
        status: DIGEST_STATUS.SUCCESS,
        fetchedAt: Date.now(),
        data,
      };

      this.update((state) => {
        state.digests[coingeckoSlug] = entry;
        this.#evictStaleEntries(state);
      });

      return entry;
    } catch (error) {
      const entry: DigestEntry = {
        asset: coingeckoSlug,
        status: DIGEST_STATUS.ERROR,
        error: error instanceof Error ? error.message : 'Unknown error',
      };

      this.update((state) => {
        state.digests[coingeckoSlug] = entry;
      });

      return entry;
    }
  }

  clearDigest(coingeckoSlug: string): void {
    this.update((state) => {
      delete state.digests[coingeckoSlug];
    });
  }

  clearAllDigests(): void {
    this.update((state) => {
      state.digests = {};
    });
  }

  /**
   * Evicts stale (TTL expired), error, and oldest entries (FIFO) if cache exceeds max size.
   *
   * @param state - The current controller state to evict entries from.
   */
  #evictStaleEntries(state: AiDigestControllerState): void {
    const now = Date.now();
    const entries = Object.entries(state.digests);
    const keysToDelete: string[] = [];

    // Collect fresh entries (with fetchedAt) and mark stale/error entries for deletion
    const freshEntries: [string, DigestEntry & { fetchedAt: number }][] = [];
    for (const [key, entry] of entries) {
      // Evict error entries to prevent unbounded accumulation
      if (entry.status === DIGEST_STATUS.ERROR) {
        keysToDelete.push(key);
      } else if (
        entry.fetchedAt !== undefined &&
        now - entry.fetchedAt >= CACHE_DURATION_MS
      ) {
        // Evict stale entries (TTL expired)
        keysToDelete.push(key);
      } else if (entry.fetchedAt !== undefined) {
        // Keep fresh entries for size-based eviction check
        freshEntries.push([key, entry as DigestEntry & { fetchedAt: number }]);
      }
    }

    // Evict oldest entries if over max cache size
    if (freshEntries.length > MAX_CACHE_ENTRIES) {
      freshEntries.sort((a, b) => a[1].fetchedAt - b[1].fetchedAt);
      const entriesToRemove = freshEntries.length - MAX_CACHE_ENTRIES;
      for (let i = 0; i < entriesToRemove; i++) {
        keysToDelete.push(freshEntries[i][0]);
      }
    }

    // Delete the entries
    for (const key of keysToDelete) {
      delete state.digests[key];
    }
  }
}
