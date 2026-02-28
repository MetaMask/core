import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { safelyExecute } from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';
import type {
  NetworkControllerStateChangeEvent,
  NetworkState,
  NetworkControllerGetNetworkClientByIdAction,
} from '@metamask/network-controller';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import type {
  StorageServiceSetItemAction,
  StorageServiceGetItemAction,
  StorageServiceGetAllKeysAction,
} from '@metamask/storage-service';
import type { Hex } from '@metamask/utils';

import {
  isTokenListSupportedForNetwork,
  formatAggregatorNames,
  formatIconUrlWithProxy,
} from './assetsUtil';
import { TokenRwaData, fetchTokenListByChainId } from './token-service';

// 4 Hour Interval Cache Refresh Threshold
const DEFAULT_INTERVAL = 4 * 60 * 60 * 1000;
const DEFAULT_THRESHOLD = 4 * 60 * 60 * 1000;

const name = 'TokenListController';

export type TokenListToken = {
  name: string;
  symbol: string;
  decimals: number;
  address: string;
  occurrences: number;
  aggregators: string[];
  iconUrl: string;
  rwaData?: TokenRwaData;
};

export type TokenListMap = Record<string, TokenListToken>;

export type DataCache = {
  timestamp: number;
  data: TokenListMap;
};
export type TokensChainsCache = {
  [chainId: Hex]: DataCache;
};

export type TokenListState = {
  tokensChainsCache: TokensChainsCache;
};

export type TokenListStateChange = ControllerStateChangeEvent<
  typeof name,
  TokenListState
>;

export type TokenListControllerEvents = TokenListStateChange;

export type GetTokenListState = ControllerGetStateAction<
  typeof name,
  TokenListState
>;

export type ForceRefreshTokenList = {
  type: `${typeof name}:forceRefreshTokenList`;
  handler: (chainId: Hex) => Promise<void>;
};

export type TokenListControllerActions = GetTokenListState | ForceRefreshTokenList;

type AllowedActions =
  | NetworkControllerGetNetworkClientByIdAction
  | StorageServiceSetItemAction
  | StorageServiceGetItemAction
  | StorageServiceGetAllKeysAction;

type AllowedEvents = NetworkControllerStateChangeEvent;

export type TokenListControllerMessenger = Messenger<
  typeof name,
  TokenListControllerActions | AllowedActions,
  TokenListControllerEvents | AllowedEvents
>;

const metadata: StateMetadata<TokenListState> = {
  tokensChainsCache: {
    includeInStateLogs: false,
    persist: false, // Persisted separately via StorageService
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
};

export const getDefaultTokenListState = (): TokenListState => {
  return {
    tokensChainsCache: {},
  };
};

/** The input to start polling for the {@link TokenListController} */
type TokenListPollingInput = {
  chainId: Hex;
};

/**
 * Controller that passively polls on a set interval for the list of tokens from metaswaps api
 */
export class TokenListController extends StaticIntervalPollingController<TokenListPollingInput>()<
  typeof name,
  TokenListState,
  TokenListControllerMessenger
> {
  /**
   * Debounce timer for persisting state changes to storage.
   */
  #persistDebounceTimer?: ReturnType<typeof setTimeout>;

  /**
   * Promise that resolves when the current persist operation completes.
   * Used to prevent race conditions between persist operations.
   */
  #persistInFlightPromise?: Promise<void>;

  /**
   * Tracks which chains have pending changes to persist.
   * Only changed chains are persisted to reduce write amplification.
   */
  readonly #changedChainsToPersist: Set<Hex> = new Set();

  /**
   * Previous tokensChainsCache for detecting which chains changed.
   */
  #previousTokensChainsCache: TokensChainsCache = {};

  /**
   * Tracks whether the controller has been initialized.
   * Used to safely unregister action handlers in destroy().
   */
  #isInitialized = false;

  /**
   * Debounce delay for persisting state changes (in milliseconds).
   */
  static readonly #persistDebounceMs = 500;

  // Storage key prefix for per-chain files
  static readonly #storageKeyPrefix = 'tokensChainsCache';

  /**
   * Get storage key for a specific chain.
   *
   * @param chainId - The chain ID.
   * @returns Storage key for the chain.
   */
  static #getChainStorageKey(chainId: Hex): string {
    return `${TokenListController.#storageKeyPrefix}:${chainId}`;
  }

  #intervalId?: ReturnType<typeof setTimeout>;

  readonly #intervalDelay: number;

  readonly #cacheRefreshThreshold: number;

  #chainId: Hex;

  #abortController: AbortController;

  /**
   * Creates a TokenListController instance.
   *
   * @param options - The controller options.
   * @param options.chainId - The chain ID of the current network.
   * @param options.onNetworkStateChange - A function for registering an event handler for network state changes.
   * @param options.interval - The polling interval, in milliseconds.
   * @param options.cacheRefreshThreshold - The token cache expiry time, in milliseconds.
   * @param options.messenger - A restricted messenger.
   * @param options.state - Initial state to set on this controller.
   */
  constructor({
    chainId,
    onNetworkStateChange,
    interval = DEFAULT_INTERVAL,
    cacheRefreshThreshold = DEFAULT_THRESHOLD,
    messenger,
    state,
  }: {
    chainId: Hex;
    onNetworkStateChange?: (
      listener: (networkState: NetworkState) => void,
    ) => void;
    interval?: number;
    cacheRefreshThreshold?: number;
    messenger: TokenListControllerMessenger;
    state?: Partial<TokenListState>;
  }) {
    super({
      name,
      metadata,
      messenger,
      state: { ...getDefaultTokenListState(), ...state },
    });

    this.#intervalDelay = interval;
    this.setIntervalLength(interval);
    this.#cacheRefreshThreshold = cacheRefreshThreshold;
    this.#chainId = chainId;
    this.#abortController = new AbortController();

    if (onNetworkStateChange) {
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      onNetworkStateChange(async (networkControllerState) => {
        await this.#onNetworkControllerStateChange(networkControllerState);
      });
    } else {
      this.messenger.subscribe(
        'NetworkController:stateChange',
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        async (networkControllerState) => {
          await this.#onNetworkControllerStateChange(networkControllerState);
        },
      );
    }
  }

  /**
   * Initialize the controller by loading cache from storage and running migration.
   * This method should be called by clients after construction.
   *
   * @returns A promise that resolves when initialization is complete.
   */
  async initialize(): Promise<void> {
    await this.#synchronizeCacheWithStorage();

    // Subscribe to state changes to automatically persist tokensChainsCache
    this.messenger.subscribe(
      'TokenListController:stateChange',
      (newCache: TokensChainsCache) => this.#onCacheChanged(newCache),
      (controllerState) => controllerState.tokensChainsCache,
    );

    // Register action handlers
    this.messenger.registerActionHandler(
      `${name}:forceRefreshTokenList`,
      (chainId: Hex) => this.forceRefreshTokenList(chainId),
    );

    this.#isInitialized = true;
  }

  /**
   * Handle tokensChainsCache changes by detecting which chains changed
   * and scheduling debounced persistence.
   *
   * @param newCache - The new tokensChainsCache state.
   */
  #onCacheChanged(newCache: TokensChainsCache): void {
    // Detect which chains changed by comparing with previous cache
    for (const chainId of Object.keys(newCache) as Hex[]) {
      const newData = newCache[chainId];
      const prevData = this.#previousTokensChainsCache[chainId];

      // Chain is new or timestamp changed (indicating data update)
      if (prevData?.timestamp !== newData.timestamp) {
        this.#changedChainsToPersist.add(chainId);
      }
    }

    // Update previous cache reference
    this.#previousTokensChainsCache = { ...newCache };

    // Schedule persistence if there are changes
    if (this.#changedChainsToPersist.size > 0) {
      this.#debouncePersist();
    }
  }

  /**
   * Debounce persistence of changed chains to storage.
   */
  #debouncePersist(): void {
    if (this.#persistDebounceTimer) {
      clearTimeout(this.#persistDebounceTimer);
    }

    this.#persistDebounceTimer = setTimeout(() => {
      // Note: #persistChangedChains handles errors internally via #saveChainCacheToStorage,
      // so this promise will not reject.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.#persistChangedChains();
    }, TokenListController.#persistDebounceMs);
  }

  /**
   * Persist only the chains that have changed to storage.
   * Reduces write amplification by skipping unchanged chains.
   *
   * If a persist operation is already in-flight, this method returns early
   * and reschedules the debounce to ensure accumulated changes are retried
   * after the current operation completes.
   *
   * @returns A promise that resolves when changed chains are persisted.
   */
  async #persistChangedChains(): Promise<void> {
    if (this.#persistInFlightPromise) {
      // Reschedule debounce to retry accumulated changes after in-flight persist completes
      if (this.#changedChainsToPersist.size > 0) {
        this.#debouncePersist();
      }
      return;
    }

    const chainsToPersist = [...this.#changedChainsToPersist];
    this.#changedChainsToPersist.clear();

    if (chainsToPersist.length === 0) {
      return;
    }

    this.#persistInFlightPromise = Promise.all(
      chainsToPersist.map((chainId) => this.#saveChainCacheToStorage(chainId)),
    ).then(() => undefined);

    try {
      await this.#persistInFlightPromise;
    } finally {
      this.#persistInFlightPromise = undefined;
    }
  }

  /**
   * Synchronize tokensChainsCache between state and storage bidirectionally.
   *
   * This method:
   * 1. Loads cached chains from storage (per-chain files) in parallel
   * 2. Merges loaded data into state (preferring existing state to avoid overwriting fresh data)
   * 3. Persists any chains that exist in state but not in storage
   *
   * Called during initialization to ensure state and storage are consistent.
   *
   * @returns A promise that resolves when synchronization is complete.
   */
  async #synchronizeCacheWithStorage(): Promise<void> {
    try {
      const allKeys = await this.messenger.call(
        'StorageService:getAllKeys',
        name,
      );

      // Filter keys that belong to tokensChainsCache (per-chain files)
      const cacheKeys = allKeys.filter((key) =>
        key.startsWith(`${TokenListController.#storageKeyPrefix}:`),
      );

      // Load all chains in parallel
      const chainCaches = await Promise.all(
        cacheKeys.map(async (key) => {
          // Extract chainId from key: 'tokensChainsCache:0x1' → '0x1'
          const chainId = key.split(':')[1] as Hex;

          const { result, error } = await this.messenger.call(
            'StorageService:getItem',
            name,
            key,
          );

          if (error) {
            console.error(
              `TokenListController: Error loading cache for ${chainId}:`,
              error,
            );
            return null;
          }

          return result ? { chainId, data: result as DataCache } : null;
        }),
      );

      // Build complete cache from loaded chains
      const loadedCache: TokensChainsCache = {};
      chainCaches.forEach((chainCache) => {
        if (chainCache) {
          loadedCache[chainCache.chainId] = chainCache.data;
        }
      });

      // Chains in state _before loading persisted state_, from a recent update
      const chainsInState = new Set(
        Object.keys(this.state.tokensChainsCache) as Hex[],
      );

      // Merge loaded cache with existing state, preferring existing data
      // (which may be fresher if fetched during initialization)
      if (Object.keys(loadedCache).length > 0) {
        this.update((state) => {
          // Only load chains that don't already exist in state
          // This prevents overwriting fresh API data with stale cached data
          for (const [chainId, cacheData] of Object.entries(loadedCache)) {
            if (!state.tokensChainsCache[chainId as Hex]) {
              state.tokensChainsCache[chainId as Hex] = cacheData;
            }
          }
        });
      }

      // Persist chains that exist in state but were not loaded from storage.
      // This handles the case where initial state contains chains that don't exist
      // in storage yet (e.g., fresh data from API). Without this, those chains
      // would be lost on the next app restart.
      for (const chainId of chainsInState) {
        this.#changedChainsToPersist.add(chainId);
      }

      // Persist any chains that need to be saved
      if (this.#changedChainsToPersist.size > 0) {
        this.#debouncePersist();
      }

      this.#previousTokensChainsCache = { ...this.state.tokensChainsCache };
    } catch (error) {
      console.error(
        'TokenListController: Failed to load cache from storage:',
        error,
      );
    }
  }

  /**
   * Save a specific chain's cache to StorageService.
   * This persists only the updated chain's data, reducing write amplification.
   *
   * @param chainId - The chain ID to save.
   * @returns A promise that resolves when saving is complete.
   */
  async #saveChainCacheToStorage(chainId: Hex): Promise<void> {
    try {
      const chainData = this.state.tokensChainsCache[chainId];

      if (!chainData) {
        console.warn(`TokenListController: No cache data for chain ${chainId}`);
        return;
      }

      const storageKey = TokenListController.#getChainStorageKey(chainId);

      await this.messenger.call(
        'StorageService:setItem',
        name,
        storageKey,
        chainData,
      );
    } catch (error) {
      console.error(
        `TokenListController: Failed to save cache for ${chainId}:`,
        error,
      );
    }
  }

  /**
   * Updates state and restarts polling on changes to the network controller
   * state.
   *
   * @param networkControllerState - The updated network controller state.
   */
  async #onNetworkControllerStateChange(
    networkControllerState: NetworkState,
  ): Promise<void> {
    const selectedNetworkClient = this.messenger.call(
      'NetworkController:getNetworkClientById',
      networkControllerState.selectedNetworkClientId,
    );
    const { chainId } = selectedNetworkClient.configuration;

    if (this.#chainId !== chainId) {
      this.#abortController.abort();
      this.#abortController = new AbortController();
      this.#chainId = chainId;
    }
  }

  // Eventually we want to remove start/restart/stop controls in favor of new _executePoll API
  // Maintaining these functions for now until we can safely deprecate them for backwards compatibility
  /**
   * Start polling for the token list.
   *
   * @deprecated This method is deprecated and will be removed in the future.
   * Consider using the new polling approach instead
   */
  async start(): Promise<void> {
    if (!isTokenListSupportedForNetwork(this.#chainId)) {
      return;
    }
    await this.#startDeprecatedPolling();
  }

  /**
   * Restart polling for the token list.
   *
   * @deprecated This method is deprecated and will be removed in the future.
   * Consider using the new polling approach instead
   */
  async restart(): Promise<void> {
    this.#stopPolling();
    await this.#startDeprecatedPolling();
  }

  /**
   * Stop polling for the token list.
   *
   * @deprecated This method is deprecated and will be removed in the future.
   * Consider using the new polling approach instead
   */
  stop(): void {
    this.#stopPolling();
  }

  /**
   * This stops any active polling.
   *
   * @deprecated This method is deprecated and will be removed in the future.
   * Consider using the new polling approach instead
   */
  override destroy(): void {
    super.destroy();
    this.#stopPolling();

    // Cancel any pending debounced persistence operations
    if (this.#persistDebounceTimer) {
      clearTimeout(this.#persistDebounceTimer);
      this.#persistDebounceTimer = undefined;
    }
    this.#changedChainsToPersist.clear();

    // Unregister action handlers if they were registered
    if (this.#isInitialized) {
      this.messenger.unregisterActionHandler(`${name}:forceRefreshTokenList`);
    }
  }

  /**
   * This stops any active polling intervals.
   *
   * @deprecated This method is deprecated and will be removed in the future.
   * Consider using the new polling approach instead
   */
  #stopPolling(): void {
    if (this.#intervalId) {
      clearInterval(this.#intervalId);
    }
  }

  /**
   * Starts a new polling interval for a given chainId (this should be deprecated in favor of _executePoll)
   *
   * @deprecated This method is deprecated and will be removed in the future.
   * Consider using the new polling approach instead
   */
  async #startDeprecatedPolling(): Promise<void> {
    // renaming this to avoid collision with base class
    await safelyExecute(() => this.fetchTokenList(this.#chainId));
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    this.#intervalId = setInterval(async () => {
      await safelyExecute(() => this.fetchTokenList(this.#chainId));
    }, this.#intervalDelay);
  }

  /**
   * This starts a new polling loop for any given chain. Under the hood it is deduping polls
   *
   * @param input - The input for the poll.
   * @param input.chainId - The chainId of the chain to trigger the fetch.
   * @returns A promise that resolves when this operation completes.
   */
  async _executePoll({ chainId }: TokenListPollingInput): Promise<void> {
    return this.fetchTokenList(chainId);
  }

  /**
   * Internal helper method to fetch and update token list from the API.
   * Handles token formatting, state updates, and error handling.
   *
   * @param chainId - The chainId of the chain to fetch tokens for.
   * @returns A promise that resolves when the operation completes.
   */
  async #fetchAndUpdateTokenList(chainId: Hex): Promise<void> {
    // Fetch fresh token list from the API
    const tokensFromAPI = await safelyExecute(
      () =>
        fetchTokenListByChainId(
          chainId,
          this.#abortController.signal,
        ) as Promise<TokenListToken[]>,
    );

    // Have response - process and update list
    if (tokensFromAPI) {
      // Format tokens from API (HTTP) and update tokenList
      const tokenList: TokenListMap = {};
      for (const token of tokensFromAPI) {
        tokenList[token.address] = {
          ...token,
          aggregators: formatAggregatorNames(token.aggregators),
          iconUrl: formatIconUrlWithProxy({
            chainId,
            tokenAddress: token.address,
          }),
        };
      }

      // Update state - persistence happens automatically via subscription
      const newDataCache: DataCache = {
        data: tokenList,
        timestamp: Date.now(),
      };
      this.update((state) => {
        state.tokensChainsCache[chainId] = newDataCache;
      });
      return;
    }

    // No response - fallback to previous state, or initialise empty.
    // Only initialize with a new timestamp if there's no existing cache.
    // If there's existing cache, keep it as-is without updating the timestamp
    // to avoid making stale data appear "fresh" and preventing retry attempts.
    const existingCache = this.state.tokensChainsCache[chainId];
    if (!existingCache) {
      // No existing cache - initialize empty (persistence happens automatically)
      const newDataCache: DataCache = { data: {}, timestamp: Date.now() };
      this.update((state) => {
        state.tokensChainsCache[chainId] = newDataCache;
      });
    }
    // If there's existing cache, keep it as-is (don't update timestamp or persist)
  }

  /**
   * Fetching token list from the Token Service API. This will fetch tokens across chains.
   * State changes are automatically persisted via the stateChange subscription.
   *
   * @param chainId - The chainId of the current chain triggering the fetch.
   */
  async fetchTokenList(chainId: Hex): Promise<void> {
    if (this.isCacheValid(chainId)) {
      return;
    }

    await this.#fetchAndUpdateTokenList(chainId);
  }

  isCacheValid(chainId: Hex): boolean {
    const { tokensChainsCache }: TokenListState = this.state;
    const timestamp: number | undefined = tokensChainsCache[chainId]?.timestamp;
    const now = Date.now();
    return (
      timestamp !== undefined && now - timestamp < this.#cacheRefreshThreshold
    );
  }

  /**
   * Force refresh the token list for a specific chain, bypassing cache validation.
   * This method will fetch fresh data from the API regardless of cache validity.
   *
   * @param chainId - The chainId of the chain to refresh.
   * @returns A promise that resolves when the refresh is complete.
   */
  async forceRefreshTokenList(chainId: Hex): Promise<void> {
    if (!isTokenListSupportedForNetwork(chainId)) {
      return;
    }

    await this.#fetchAndUpdateTokenList(chainId);
  }
}

export default TokenListController;
