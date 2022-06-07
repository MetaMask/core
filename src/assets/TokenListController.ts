import type { Patch } from 'immer';
import { Mutex } from 'async-mutex';
import { AbortController } from 'abort-controller';
import { BaseController } from '../BaseControllerV2';
import type { RestrictedControllerMessenger } from '../ControllerMessenger';
import { safelyExecute, isTokenDetectionSupportedForNetwork } from '../util';
import { fetchTokenList } from '../apis/token-service';
import { NetworkState } from '../network/NetworkController';
import { formatAggregatorNames, formatIconUrlWithProxy } from './assetsUtil';

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
  TokenListStateChange,
  never,
  TokenListStateChange['type']
>;

const metadata = {
  tokenList: { persist: true, anonymous: true },
  tokensChainsCache: { persist: true, anonymous: true },
};

const defaultState: TokenListState = {
  tokenList: {},
  tokensChainsCache: {},
};

/**
 * Controller that passively polls on a set interval for the list of tokens from metaswaps api
 */
export class TokenListController extends BaseController<
  typeof name,
  TokenListState,
  TokenListMessenger
> {
  private mutex = new Mutex();

  private intervalId?: NodeJS.Timeout;

  private intervalDelay: number;

  private cacheRefreshThreshold: number;

  private chainId: string;

  private abortController: AbortController;

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
   */
  constructor({
    chainId,
    onNetworkStateChange,
    interval = DEFAULT_INTERVAL,
    cacheRefreshThreshold = DEFAULT_THRESHOLD,
    messenger,
    state,
  }: {
    chainId: string;
    onNetworkStateChange: (
      listener: (networkState: NetworkState) => void,
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
    this.abortController = new AbortController();
    onNetworkStateChange(async (networkState) => {
      if (this.chainId !== networkState.provider.chainId) {
        this.abortController.abort();
        this.abortController = new AbortController();
        this.chainId = networkState.provider.chainId;
        // Ensure tokenList is referencing data from correct network
        this.update(() => {
          return {
            ...this.state,
            tokenList: this.state.tokensChainsCache[this.chainId]?.data || {},
          };
        });
        await this.restart();
      }
    });
  }

  /**
   * Start polling for the token list.
   */
  async start() {
    if (!isTokenDetectionSupportedForNetwork(this.chainId)) {
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
}

export default TokenListController;
