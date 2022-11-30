import type { Patch } from 'immer';
import { Mutex } from 'async-mutex';
import { AbortController as WhatwgAbortController } from 'abort-controller';
import {
  BaseControllerV2,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';
import { safelyExecute } from '@metamask/controller-utils';
import {
  NetworkControllerProviderConfigChangeEvent,
  NetworkState,
  ProviderConfig,
} from '@metamask/network-controller';
import {
  isTokenListSupportedForNetwork,
  formatAggregatorNames,
  formatIconUrlWithProxy,
} from './assetsUtil';
import { fetchTokenList } from './token-service';

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
type TokensChainsCache = {
  [chainSlug: string]: DataCache;
};

export type TokenListState = {
  tokenList: TokenListMap;
  tokensChainsCache: TokensChainsCache;
  preventPollingOnNetworkRestart: boolean;
};

export type TokenListStateChange = {
  type: `${typeof name}:stateChange`;
  payload: [TokenListState, Patch[]];
};

export type GetTokenListState = {
  type: `${typeof name}:getState`;
  handler: () => TokenListState;
};

type TokenListMessenger = RestrictedControllerMessenger<
  typeof name,
  GetTokenListState,
  TokenListStateChange | NetworkControllerProviderConfigChangeEvent,
  never,
  | TokenListStateChange['type']
  | NetworkControllerProviderConfigChangeEvent['type']
>;

const metadata = {
  tokenList: { persist: true, anonymous: true },
  tokensChainsCache: { persist: true, anonymous: true },
  preventPollingOnNetworkRestart: { persist: true, anonymous: true },
};

const defaultState: TokenListState = {
  tokenList: {},
  tokensChainsCache: {},
  preventPollingOnNetworkRestart: false,
};

/**
 * Controller that passively polls on a set interval for the list of tokens from metaswaps api
 */
export class TokenListController extends BaseControllerV2<
  typeof name,
  TokenListState,
  TokenListMessenger
> {
  private mutex = new Mutex();

  private intervalId?: ReturnType<typeof setTimeout>;

  private intervalDelay: number;

  private cacheRefreshThreshold: number;

  private chainId: string;

  private abortController: WhatwgAbortController;

  /**
   * Creates a TokenListController instance.
   *
   * @param options - The controller options.
   * @param options.chainId - The chain ID of the current network.
   * @param options.onNetworkStateChange - A function for registering an event handler for network state changes.
   * @param options.interval - The polling interval, in milliseconds.
   * @param options.cacheRefreshThreshold - The token cache expiry time, in milliseconds.
   * @param options.messenger - A restricted controller messenger.
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
    chainId: string;
    preventPollingOnNetworkRestart?: boolean;
    onNetworkStateChange?: (
      listener: (networkState: NetworkState | ProviderConfig) => void,
    ) => void;
    interval?: number;
    cacheRefreshThreshold?: number;
    messenger: TokenListMessenger;
    state?: Partial<TokenListState>;
  }) {
    super({
      name,
      metadata,
      messenger,
      state: { ...defaultState, ...state },
    });
    this.intervalDelay = interval;
    this.cacheRefreshThreshold = cacheRefreshThreshold;
    this.chainId = chainId;
    this.updatePreventPollingOnNetworkRestart(preventPollingOnNetworkRestart);
    this.abortController = new WhatwgAbortController();
    if (onNetworkStateChange) {
      onNetworkStateChange(async (networkStateOrProviderConfig) => {
        // this check for "provider" is for testing purposes, since in the extension this callback will receive
        // an object typed as NetworkState but within repo we can only simulate as if the callback receives an
        // object typed as ProviderConfig
        if ('providerConfig' in networkStateOrProviderConfig) {
          await this.#onNetworkStateChangeCallback(
            networkStateOrProviderConfig.providerConfig,
          );
        } else {
          await this.#onNetworkStateChangeCallback(
            networkStateOrProviderConfig,
          );
        }
      });
    } else {
      this.messagingSystem.subscribe(
        'NetworkController:providerConfigChange',
        async (providerConfig) => {
          await this.#onNetworkStateChangeCallback(providerConfig);
        },
      );
    }
  }

  /**
   * Updates state and restart polling when updates are received through NetworkController subscription.
   *
   * @param providerConfig - the configuration for a provider containing critical network info.
   */
  async #onNetworkStateChangeCallback(providerConfig: ProviderConfig) {
    if (this.chainId !== providerConfig.chainId) {
      this.abortController.abort();
      this.abortController = new WhatwgAbortController();
      this.chainId = providerConfig.chainId;
      if (this.state.preventPollingOnNetworkRestart) {
        this.clearingTokenListData();
      } else {
        // Ensure tokenList is referencing data from correct network
        this.update(() => {
          return {
            ...this.state,
            tokenList: this.state.tokensChainsCache[this.chainId]?.data || {},
          };
        });
        await this.restart();
      }
    }
  }

  /**
   * Start polling for the token list.
   */
  async start() {
    if (!isTokenListSupportedForNetwork(this.chainId)) {
      return;
    }
    await this.startPolling();
  }

  /**
   * Restart polling for the token list.
   */
  async restart() {
    this.stopPolling();
    await this.startPolling();
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
   * Starts a new polling interval.
   */
  private async startPolling(): Promise<void> {
    await safelyExecute(() => this.fetchTokenList());
    this.intervalId = setInterval(async () => {
      await safelyExecute(() => this.fetchTokenList());
    }, this.intervalDelay);
  }

  /**
   * Fetching token list from the Token Service API.
   */
  async fetchTokenList(): Promise<void> {
    const releaseLock = await this.mutex.acquire();
    try {
      const { tokensChainsCache } = this.state;
      let tokenList: TokenListMap = {};
      const cachedTokens: TokenListMap = await safelyExecute(() =>
        this.fetchFromCache(),
      );
      if (cachedTokens) {
        // Use non-expired cached tokens
        tokenList = { ...cachedTokens };
      } else {
        // Fetch fresh token list
        const tokensFromAPI: TokenListToken[] = await safelyExecute(() =>
          fetchTokenList(this.chainId, this.abortController.signal),
        );

        if (!tokensFromAPI) {
          // Fallback to expired cached tokens
          tokenList = { ...(tokensChainsCache[this.chainId]?.data || {}) };

          this.update(() => {
            return {
              ...this.state,
              tokenList,
              tokensChainsCache,
            };
          });
          return;
        }
        // Filtering out tokens with less than 3 occurrences and native tokens
        const filteredTokenList = tokensFromAPI.filter(
          (token) =>
            token.occurrences &&
            token.occurrences >= 3 &&
            token.address !== '0x0000000000000000000000000000000000000000',
        );
        // Removing the tokens with symbol conflicts
        const symbolsList = filteredTokenList.map((token) => token.symbol);
        const duplicateSymbols = [
          ...new Set(
            symbolsList.filter(
              (symbol, index) => symbolsList.indexOf(symbol) !== index,
            ),
          ),
        ];
        const uniqueTokenList = filteredTokenList.filter(
          (token) => !duplicateSymbols.includes(token.symbol),
        );
        for (const token of uniqueTokenList) {
          const formattedToken: TokenListToken = {
            ...token,
            aggregators: formatAggregatorNames(token.aggregators),
            iconUrl: formatIconUrlWithProxy({
              chainId: this.chainId,
              tokenAddress: token.address,
            }),
          };
          tokenList[token.address] = formattedToken;
        }
      }
      const updatedTokensChainsCache: TokensChainsCache = {
        ...tokensChainsCache,
        [this.chainId]: {
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
   *
   * @returns The cached data, or `null` if the cache was expired.
   */
  async fetchFromCache(): Promise<TokenListMap | null> {
    const { tokensChainsCache }: TokenListState = this.state;
    const dataCache = tokensChainsCache[this.chainId];
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
