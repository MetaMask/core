import type { Patch } from 'immer';
import { Mutex } from 'async-mutex';
import { BaseController } from '../BaseControllerV2';
import type { RestrictedControllerMessenger } from '../ControllerMessenger';
import { safelyExecute } from '../util';
import {
  fetchTokenList,
  syncTokens,
  fetchTokenMetadata,
} from '../apis/token-service';
import { NetworkState } from '../network/NetworkController';

const DEFAULT_INTERVAL = 60 * 60 * 1000;
const DEFAULT_THRESHOLD = 60 * 30 * 1000;

const name = 'TokenListController';

interface DataCache {
  timestamp: number;
  data: Token[];
}
interface TokensChainsCache {
  [chainSlug: string]: DataCache;
}

type Token = {
  name: string;
  address: string;
  decimals: number;
  symbol: string;
  occurrences: number;
  aggregators: string[];
  iconUrl: string;
};

type TokenMap = {
  [address: string]: Token;
};

export type TokenListState = {
  tokenList: TokenMap;
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
  TokenListState
> {
  private mutex = new Mutex();

  private intervalId?: NodeJS.Timeout;

  private intervalDelay: number;

  private cacheRefreshThreshold: number;

  private chainId: string;

  /**
   * Creates a TokenListController instance
   *
   * @param options - Constructor options
   * @param options.interval - The polling interval, in milliseconds
   * @param options.messenger - A reference to the messaging system
   * @param options.state - Initial state to set on this controller
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
    messenger: RestrictedControllerMessenger<
      typeof name,
      GetTokenListState,
      TokenListStateChange,
      never,
      never
    >;
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
    onNetworkStateChange(async (networkState) => {
      this.chainId = networkState.provider.chainId;
      await safelyExecute(() => this.fetchTokenList());
    });
  }

  /**
   * Start polling for the token list
   */
  async start() {
    await this.startPolling();
  }

  /**
   * Stop polling for the token list
   */
  stop() {
    this.stopPolling();
  }

  /**
   * Prepare to discard this controller.
   *
   * This stops any active polling.
   */
  destroy() {
    super.destroy();
    this.stopPolling();
  }

  private stopPolling() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  /**
   * Starts a new polling interval
   */
  private async startPolling(): Promise<void> {
    await safelyExecute(() => this.fetchTokenList());
    this.intervalId = setInterval(async () => {
      await safelyExecute(() => this.fetchTokenList());
    }, this.intervalDelay);
  }

  /**
   * Fetching token list from the Token Service API
   */
  async fetchTokenList(): Promise<void> {
    const releaseLock = await this.mutex.acquire();
    try {
      const tokensFromAPI: Token[] = await safelyExecute(() =>
        this.fetchFromCache(),
      );
      const { tokensChainsCache } = this.state;
      const tokenList: TokenMap = {};

      // filtering out tokens with less than 2 occurences
      const filteredTokenList = tokensFromAPI.filter(
        (token) => token.occurrences >= 2,
      );
      // removing the tokens with symbol conflicts
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
        tokenList[token.address] = token;
      }
      this.update(() => {
        return {
          tokenList,
          tokensChainsCache,
        };
      });
    } finally {
      releaseLock();
    }
  }

  /**
   * Checks if the Cache timestamp is valid,
   *  if yes data in cache will be returned
   *  otherwise a call to the API service will be made.
   * @returns Promise that resolves into a TokenList
   */
  async fetchFromCache(): Promise<Token[]> {
    const { tokensChainsCache, ...tokensData }: TokenListState = this.state;
    const dataCache = tokensChainsCache[this.chainId];
    const now = Date.now();
    if (
      dataCache?.data &&
      now - dataCache?.timestamp < this.cacheRefreshThreshold
    ) {
      return dataCache.data;
    }
    const tokenList: Token[] = await safelyExecute(() =>
      fetchTokenList(this.chainId),
    );
    const updatedTokensChainsCache = {
      ...tokensChainsCache,
      [this.chainId]: {
        timestamp: Date.now(),
        data: tokenList,
      },
    };
    this.update(() => {
      return {
        ...tokensData,
        tokensChainsCache: updatedTokensChainsCache,
      };
    });
    return tokenList;
  }

  /**
   * Calls the API to sync the tokens in the token service
   */
  async syncTokens(): Promise<void> {
    const releaseLock = await this.mutex.acquire();
    try {
      await safelyExecute(() => syncTokens(this.chainId));
      const { tokenList, tokensChainsCache } = this.state;
      const updatedTokensChainsCache = {
        ...tokensChainsCache,
        [this.chainId]: {
          timestamp: 0,
          data: [],
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
   * Fetch metadata for a token whose address is send to the API
   * @param tokenAddress
   * @returns Promise that resolvesto Token Metadata
   */
  async fetchTokenMetadata(tokenAddress: string): Promise<Token> {
    const releaseLock = await this.mutex.acquire();
    try {
      const token = await safelyExecute(() =>
        fetchTokenMetadata(this.chainId, tokenAddress),
      );
      return token;
    } finally {
      releaseLock();
    }
  }
}

export default TokenListController;
