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
import type { Hex } from '@metamask/utils';
import { Mutex } from 'async-mutex';

import {
  isTokenListSupportedForNetwork,
  formatAggregatorNames,
  formatIconUrlWithProxy,
} from './assetsUtil';
import { fetchTokenListByChainId } from './token-service';
import { TokenCacheService } from './TokenCacheService';

const DEFAULT_INTERVAL = 24 * 60 * 60 * 1000;
const DEFAULT_THRESHOLD = 24 * 60 * 60 * 1000;

const name = 'TokenListController';

// todo: move to TokenCacheService
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

type DataCache = {
  timestamp: number;
  data: TokenListMap;
};
export type TokensChainsCache = {
  [chainId: Hex]: DataCache;
};

export type TokenListState = {
  preventPollingOnNetworkRestart: boolean;
};

export type TokenListStateChange = ControllerStateChangeEvent<
  typeof name,
  TokenListState
>;

export type TokenListCacheUpdate = {
  type: `${typeof name}:cacheUpdate`;
  payload: [TokensChainsCache];
};

export type TokenListControllerEvents =
  | TokenListStateChange
  | TokenListCacheUpdate;

export type GetTokenListState = ControllerGetStateAction<
  typeof name,
  TokenListState
>;

export type GetTokenListForChain = {
  type: `${typeof name}:getTokenListForChain`;
  handler: (chainId: Hex) => TokenListMap | undefined;
};

export type GetAllTokenLists = {
  type: `${typeof name}:getAllTokenLists`;
  handler: () => TokensChainsCache;
};

export type TokenListControllerActions =
  | GetTokenListState
  | GetTokenListForChain
  | GetAllTokenLists;

type AllowedActions = NetworkControllerGetNetworkClientByIdAction;

type AllowedEvents = NetworkControllerStateChangeEvent;

export type TokenListControllerMessenger = Messenger<
  typeof name,
  TokenListControllerActions | AllowedActions,
  TokenListControllerEvents | AllowedEvents
>;

const metadata: StateMetadata<TokenListState> = {
  preventPollingOnNetworkRestart: {
    includeInStateLogs: false,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: false,
  },
};

export const getDefaultTokenListState = (): TokenListState => {
  return {
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
  private readonly mutex = new Mutex();

  private intervalId?: ReturnType<typeof setTimeout>;

  private readonly intervalDelay: number;

  private readonly cacheRefreshThreshold: number;

  private chainId: Hex;

  private abortController: AbortController;

  private readonly cacheService: TokenCacheService;

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
    this.intervalDelay = interval;
    this.setIntervalLength(interval);
    this.cacheRefreshThreshold = cacheRefreshThreshold;
    this.chainId = chainId;
    this.updatePreventPollingOnNetworkRestart(preventPollingOnNetworkRestart);
    this.abortController = new AbortController();

    // Initialize cache service
    this.cacheService = new TokenCacheService(cacheRefreshThreshold);

    // Register messenger actions for cache access
    this.messenger.registerActionHandler(
      `${name}:getTokenListForChain`,
      (requestedChainId: Hex) => {
        return this.cacheService.get(requestedChainId)?.data;
      },
    );

    this.messenger.registerActionHandler(`${name}:getAllTokenLists`, () => {
      return this.cacheService.getAll();
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
   * Updates state and restarts polling on changes to the network controller
   * state.
   *
   * @param networkControllerState - The updated network controller state.
   */
  async #onNetworkControllerStateChange(networkControllerState: NetworkState) {
    const selectedNetworkClient = this.messenger.call(
      'NetworkController:getNetworkClientById',
      networkControllerState.selectedNetworkClientId,
    );
    const { chainId } = selectedNetworkClient.configuration;

    if (this.chainId !== chainId) {
      this.abortController.abort();
      this.abortController = new AbortController();
      this.chainId = chainId;
      if (this.state.preventPollingOnNetworkRestart) {
        this.clearingTokenListData();
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
  async start() {
    if (!isTokenListSupportedForNetwork(this.chainId)) {
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
  async restart() {
    this.stopPolling();
    await this.#startDeprecatedPolling();
  }

  /**
   * Stop polling for the token list.
   *
   * @deprecated This method is deprecated and will be removed in the future.
   * Consider using the new polling approach instead
   */
  stop() {
    this.stopPolling();
  }

  /**
   * This stops any active polling.
   *
   * @deprecated This method is deprecated and will be removed in the future.
   * Consider using the new polling approach instead
   */
  override destroy() {
    super.destroy();
    this.stopPolling();
  }

  /**
   * This stops any active polling intervals.
   *
   * @deprecated This method is deprecated and will be removed in the future.
   * Consider using the new polling approach instead
   */
  private stopPolling() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
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
    await safelyExecute(() => this.fetchTokenList(this.chainId));
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    this.intervalId = setInterval(async () => {
      await safelyExecute(() => this.fetchTokenList(this.chainId));
    }, this.intervalDelay);
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
   * Fetching token list from the Token Service API. This will fetch tokens across chains and update the cache service.
   *
   * @param chainId - The chainId of the current chain triggering the fetch.
   */
  async fetchTokenList(chainId: Hex): Promise<void> {
    const releaseLock = await this.mutex.acquire();
    try {
      if (this.isCacheValid(chainId)) {
        return;
      }

      // Fetch fresh token list from the API
      const tokensFromAPI = await safelyExecute(
        () =>
          fetchTokenListByChainId(
            chainId,
            this.abortController.signal,
          ) as Promise<TokenListToken[]>,
      );

      // Have response - process and update cache
      if (tokensFromAPI) {
        // Format tokens from API (HTTP) and update cache
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

        this.cacheService.set(chainId, tokenList);
        this.messenger.publish(
          `${name}:cacheUpdate`,
          this.cacheService.getAll(),
        );
        return;
      }

      // No response - set empty cache with timestamp to prevent repeated failed fetches
      if (!tokensFromAPI) {
        this.cacheService.set(chainId, {});
        this.messenger.publish(
          `${name}:cacheUpdate`,
          this.cacheService.getAll(),
        );
      }
    } finally {
      releaseLock();
    }
  }

  isCacheValid(chainId: Hex): boolean {
    return this.cacheService.isValid(chainId);
  }

  /**
   * Clearing token list cache explicitly.
   */
  clearingTokenListData(): void {
    this.cacheService.clear();
    this.messenger.publish(`${name}:cacheUpdate`, this.cacheService.getAll());
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
