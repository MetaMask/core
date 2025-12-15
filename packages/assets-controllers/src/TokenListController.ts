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
  StorageServiceRemoveItemAction,
  StorageServiceGetAllKeysAction,
} from '@metamask/storage-service';
import type { Hex } from '@metamask/utils';
import { Mutex } from 'async-mutex';

import {
  isTokenListSupportedForNetwork,
  formatAggregatorNames,
  formatIconUrlWithProxy,
} from './assetsUtil';
import { fetchTokenListByChainId } from './token-service';

const DEFAULT_INTERVAL = 24 * 60 * 60 * 1000;
const DEFAULT_THRESHOLD = 24 * 60 * 60 * 1000;

const name = 'TokenListController';

export type TokenListToken = {
  name: string;
  symbol: string;
  decimals: number;
  address: string;
  occurrences: number;
  aggregators: string[];
  iconUrl: string;
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
  preventPollingOnNetworkRestart: boolean;
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

export type TokenListControllerActions = GetTokenListState;

type AllowedActions =
  | NetworkControllerGetNetworkClientByIdAction
  | StorageServiceSetItemAction
  | StorageServiceGetItemAction
  | StorageServiceRemoveItemAction
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
  preventPollingOnNetworkRestart: {
    includeInStateLogs: false,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: false,
  },
};

export const getDefaultTokenListState = (): TokenListState => {
  return {
    tokensChainsCache: {},
    preventPollingOnNetworkRestart: false,
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
  readonly #mutex = new Mutex();

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
   * @param options.preventPollingOnNetworkRestart - Determines whether to prevent poilling on network restart in extension.
   */
  constructor({
    chainId,
    preventPollingOnNetworkRestart = false,
    onNetworkStateChange,
    interval = DEFAULT_INTERVAL,
    cacheRefreshThreshold = DEFAULT_THRESHOLD,
    messenger,
    state,
  }: {
    chainId: Hex;
    preventPollingOnNetworkRestart?: boolean;
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
    this.updatePreventPollingOnNetworkRestart(preventPollingOnNetworkRestart);
    this.#abortController = new AbortController();

    // Load cache from StorageService on initialization and handle migration
    this.#loadCacheFromStorage()
      .then(() => {
        // Migrate existing cache from state to StorageService if needed
        return this.#migrateStateToStorage();
      })
      .catch((error) => {
        console.error(
          'TokenListController: Failed to load cache from storage:',
          error,
        );
      });

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
   * Load tokensChainsCache from StorageService into state.
   * Loads all cached chains from separate per-chain files in parallel.
   * Called during initialization to restore cached data.
   *
   * @returns A promise that resolves when loading is complete.
   */
  async #loadCacheFromStorage(): Promise<void> {
    try {
      // Get all keys for this controller
      const allKeys = await this.messenger.call(
        'StorageService:getAllKeys',
        name,
      );

      // Filter keys that belong to tokensChainsCache (per-chain files)
      const cacheKeys = allKeys.filter((key) =>
        key.startsWith(`${TokenListController.#storageKeyPrefix}:`),
      );

      if (cacheKeys.length === 0) {
        return; // No cached data
      }

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

      // Load into state (all chains available for TokenDetectionController)
      if (Object.keys(loadedCache).length > 0) {
        this.update((state) => {
          state.tokensChainsCache = loadedCache;
        });
      }
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
   * Migrate tokensChainsCache from old storage formats to per-chain files.
   * Handles backward compatibility for users upgrading from:
   * 1. Old persisted state (tokensChainsCache was in state)
   * 2. Old single-file StorageService (all chains in one file)
   *
   * @returns A promise that resolves when migration is complete.
   */
  async #migrateStateToStorage(): Promise<void> {
    try {
      let dataToMigrate: TokensChainsCache | null = null;

      // Check for old single-file storage (previous StorageService version)
      const { result: oldStorageData } = await this.messenger.call(
        'StorageService:getItem',
        name,
        TokenListController.#storageKeyPrefix, // Old key without chain suffix
      );

      if (oldStorageData) {
        // Migrate from old single-file storage
        dataToMigrate = oldStorageData as TokensChainsCache;
        console.log(
          'TokenListController: Migrating from single-file to per-chain storage',
        );
      } else if (
        this.state.tokensChainsCache &&
        Object.keys(this.state.tokensChainsCache).length > 0
      ) {
        // Check if per-chain files already exist
        const allKeys = await this.messenger.call(
          'StorageService:getAllKeys',
          name,
        );
        const hasPerChainFiles = allKeys.some((key) =>
          key.startsWith(`${TokenListController.#storageKeyPrefix}:`),
        );

        if (!hasPerChainFiles) {
          // Migrate from old persisted state
          dataToMigrate = this.state.tokensChainsCache;
          console.log(
            'TokenListController: Migrating from persisted state to per-chain storage',
          );
        }
      }

      if (!dataToMigrate) {
        return; // Nothing to migrate
      }

      // Split into per-chain files
      await Promise.all(
        Object.keys(dataToMigrate).map((chainId) =>
          this.#saveChainCacheToStorage(chainId as Hex),
        ),
      );

      // Remove old single-file storage if it existed
      if (oldStorageData) {
        await this.messenger.call(
          'StorageService:removeItem',
          name,
          TokenListController.#storageKeyPrefix,
        );
      }

      console.log(
        'TokenListController: Migration to per-chain storage complete',
      );
    } catch (error) {
      console.error(
        'TokenListController: Failed to migrate cache to storage:',
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
      if (this.state.preventPollingOnNetworkRestart) {
        this.clearingTokenListData().catch((error) => {
          console.error('Failed to clear token list data:', error);
        });
      }
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
   * Fetching token list from the Token Service API. This will fetch tokens across chains.
   * Updates state and persists to StorageService separately.
   *
   * @param chainId - The chainId of the current chain triggering the fetch.
   */
  async fetchTokenList(chainId: Hex): Promise<void> {
    const releaseLock = await this.#mutex.acquire();
    try {
      if (this.isCacheValid(chainId)) {
        return;
      }

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

        // Update state
        const newDataCache: DataCache = {
          data: tokenList,
          timestamp: Date.now(),
        };
        this.update((state) => {
          state.tokensChainsCache[chainId] = newDataCache;
        });

        // Persist only this chain to StorageService (reduces write amplification)
        await this.#saveChainCacheToStorage(chainId);
        return;
      }

      // No response - fallback to previous state, or initialise empty
      if (!tokensFromAPI) {
        const newDataCache: DataCache = { data: {}, timestamp: Date.now() };
        this.update((state) => {
          state.tokensChainsCache[chainId] ??= newDataCache;
          state.tokensChainsCache[chainId].timestamp = Date.now();
        });

        // Persist only this chain to StorageService
        await this.#saveChainCacheToStorage(chainId);
      }
    } finally {
      releaseLock();
    }
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
   * Clearing tokenList and tokensChainsCache explicitly.
   * This clears both state and all per-chain files in StorageService.
   */
  async clearingTokenListData(): Promise<void> {
    // Clear state
    this.update((state) => {
      state.tokensChainsCache = {};
    });

    // Clear all per-chain files from StorageService
    try {
      const allKeys = await this.messenger.call(
        'StorageService:getAllKeys',
        name,
      );

      // Filter and remove all tokensChainsCache keys
      const cacheKeys = allKeys.filter((key) =>
        key.startsWith(`${TokenListController.#storageKeyPrefix}:`),
      );

      await Promise.all(
        cacheKeys.map((key) =>
          this.messenger.call('StorageService:removeItem', name, key),
        ),
      );

      // Also remove old single-file storage if it exists (cleanup)
      await this.messenger.call(
        'StorageService:removeItem',
        name,
        TokenListController.#storageKeyPrefix,
      );
    } catch (error) {
      console.error(
        'TokenListController: Failed to clear cache from storage:',
        error,
      );
    }
  }

  /**
   * Updates preventPollingOnNetworkRestart from extension.
   *
   * @param shouldPreventPolling - Determine whether to prevent polling on network change
   */
  updatePreventPollingOnNetworkRestart(shouldPreventPolling: boolean): void {
    this.update(() => {
      return {
        ...this.state,
        preventPollingOnNetworkRestart: shouldPreventPolling,
      };
    });
  }
}

export default TokenListController;
