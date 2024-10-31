import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';
import { safelyExecute } from '@metamask/controller-utils';
import type {
  NetworkControllerStateChangeEvent,
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

type DataCache = {
  timestamp: number;
  data: TokenListMap;
};
export type TokensChainsCache = {
  [chainId: Hex]: DataCache;
};

export type TokenListState = {
  tokenList: TokenListMap;
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

type AllowedActions = NetworkControllerGetNetworkClientByIdAction;

type AllowedEvents = NetworkControllerStateChangeEvent;

export type TokenListControllerMessenger = RestrictedControllerMessenger<
  typeof name,
  TokenListControllerActions | AllowedActions,
  TokenListControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

const metadata = {
  tokenList: { persist: true, anonymous: true },
  tokensChainsCache: { persist: true, anonymous: true },
  preventPollingOnNetworkRestart: { persist: true, anonymous: true },
};

export const getDefaultTokenListState = (): TokenListState => {
  return {
    tokenList: {},
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
  private readonly mutex = new Mutex();

  private intervalId?: ReturnType<typeof setTimeout>;

  private readonly intervalDelay: number;

  private readonly cacheRefreshThreshold: number;

  private readonly abortController: AbortController;

  /**
   * Creates a TokenListController instance.
   *
   * @param options - The controller options.
   * @param options.interval - The polling interval, in milliseconds.
   * @param options.cacheRefreshThreshold - The token cache expiry time, in milliseconds.
   * @param options.messenger - A restricted controller messenger.
   * @param options.state - Initial state to set on this controller.
   * @param options.preventPollingOnNetworkRestart - Determines whether to prevent poilling on network restart in extension.
   */
  constructor({
    preventPollingOnNetworkRestart = false,
    interval = DEFAULT_INTERVAL,
    cacheRefreshThreshold = DEFAULT_THRESHOLD,
    messenger,
    state,
  }: {
    preventPollingOnNetworkRestart?: boolean;
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
    this.cacheRefreshThreshold = cacheRefreshThreshold;
    this.updatePreventPollingOnNetworkRestart(preventPollingOnNetworkRestart);
    this.abortController = new AbortController();
  }

  /**
   * Start polling for the token list.
   */
  async start() {
    if (!isTokenListSupportedForNetwork(pollingInput.chainId)) {
      return;
    }
    await this.#startPolling(pollingInput.chainId);
  }

  /**
   * Restart polling for the token list.
   */
  async restart() {
    this.stopPolling();
    await this.#startPolling(pollingInput.chainId);
  }

  /**
   * Stop polling for the token list.
   */
  stop() {
    this.stopPolling();
  }

  /**
   * Prepare to discard this controller.
   *
   * This stops any active polling.
   */
  override destroy() {
    super.destroy();
    this.stopPolling();
  }

  private stopPolling() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  /**
   * Starts a new polling interval for a given chainId
   * @param input - The input for the poll.
   * @param input.chainId - The chainId of the chain to trigger the fetch.
   */
  async #startPolling({ chainId }: TokenListPollingInput): Promise<void> {
    await safelyExecute(() => this._executePoll({ chainId }));
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    this.intervalId = setInterval(async () => {
      await safelyExecute(() => this._executePoll({ chainId }));
    }, this.intervalDelay);
  }

  /**
   * Fetching token list from the Token Service API.
   *
   * @private
   * @param input - The input for the poll.
   * @param input.chainId - The chainId of the chain to trigger the fetch.
   * @returns A promise that resolves when this operation completes.
   */
  async _executePoll({ chainId }: TokenListPollingInput): Promise<void> {
    return this.fetchTokenList(chainId);
  }

  /**
   * Fetching token list from the Token Service API.
   *
   * @param chainId - The chainId of the network client triggering the fetch.
   */
  async fetchTokenList(chainId: Hex): Promise<void> {
    const releaseLock = await this.mutex.acquire();

    try {
      const { tokensChainsCache } = this.state;
      let tokenList: TokenListMap = {};
      const cachedTokens = await safelyExecute(() =>
        this.#fetchFromCache(chainId),
      );
      if (cachedTokens) {
        // Use non-expired cached tokens
        tokenList = { ...cachedTokens };
      } else {
        // Fetch fresh token list
        const tokensFromAPI = await safelyExecute(
          () =>
            fetchTokenListByChainId(
              chainId,
              this.abortController.signal,
            ) as Promise<TokenListToken[]>,
        );

        if (!tokensFromAPI) {
          // Fallback to expired cached tokens
          tokenList = { ...(tokensChainsCache[chainId]?.data || {}) };
          this.update(() => {
            return {
              ...this.state,
              tokenList,
              tokensChainsCache,
            };
          });
          return;
        }
        for (const token of tokensFromAPI) {
          const formattedToken: TokenListToken = {
            ...token,
            aggregators: formatAggregatorNames(token.aggregators),
            iconUrl: formatIconUrlWithProxy({
              chainId,
              tokenAddress: token.address,
            }),
          };
          tokenList[token.address] = formattedToken;
        }
      }
      const updatedTokensChainsCache: TokensChainsCache = {
        ...tokensChainsCache,
        [chainId]: {
          timestamp: Date.now(),
          data: tokenList,
        },
      };
      this.update(() => {
        return {
          ...this.state,
          tokenList,
          tokensChainsCache: updatedTokensChainsCache,
        };
      });
    } finally {
      releaseLock();
    }
  }

  /**
   * Checks if the Cache timestamp is valid,
   * if yes data in cache will be returned
   * otherwise null will be returned.
   * @param chainId - The chain ID of the network for which to fetch the cache.
   * @returns The cached data, or `null` if the cache was expired.
   */
  async #fetchFromCache(chainId: Hex): Promise<TokenListMap | null> {
    const { tokensChainsCache }: TokenListState = this.state;
    const dataCache = tokensChainsCache[chainId];
    const now = Date.now();
    if (
      dataCache?.data &&
      now - dataCache?.timestamp < this.cacheRefreshThreshold
    ) {
      return dataCache.data;
    }
    return null;
  }

  /**
   * Clearing tokenList and tokensChainsCache explicitly.
   */
  clearingTokenListData(): void {
    this.update(() => {
      return {
        ...this.state,
        tokenList: {},
        tokensChainsCache: {},
      };
    });
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
