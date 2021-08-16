import contractMap from '@metamask/contract-metadata';
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
import { PreferencesState } from '../user/PreferencesController';

const DEFAULT_INTERVAL = 60 * 60 * 1000;
const DEFAULT_THRESHOLD = 60 * 30 * 1000;

const name = 'TokenListController';

type BaseToken = {
  name: string;
  symbol: string;
  decimals: number;
};

type StaticToken = {
  logo: string;
  erc20: boolean;
} & BaseToken;

export type ContractMap = {
  [address: string]: StaticToken;
};

export type DynamicToken = {
  address: string;
  occurrences: number;
  aggregators: string[];
  iconUrl: string;
} & BaseToken;

export type TokenListToken = {
  address: string;
  iconUrl: string;
  occurrences: number | null;
  aggregators: string[] | null;
} & BaseToken;

export type TokenListMap = {
  [address: string]: TokenListToken;
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
interface DataCache {
  timestamp: number;
  data: TokenListToken[];
}
interface TokensChainsCache {
  [chainSlug: string]: DataCache;
}

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

  private useTokenDetection: boolean;

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
    useTokenDetection,
    onNetworkStateChange,
    onPreferencesStateChange,
    interval = DEFAULT_INTERVAL,
    cacheRefreshThreshold = DEFAULT_THRESHOLD,
    messenger,
    state,
  }: {
    chainId: string;
    useTokenDetection: boolean;
    onNetworkStateChange: (
      listener: (networkState: NetworkState) => void,
    ) => void;
    onPreferencesStateChange: (
      listener: (preferencesState: PreferencesState) => void,
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
    this.useTokenDetection = useTokenDetection;
    onNetworkStateChange(async (networkState) => {
      this.chainId = networkState.provider.chainId;
      await safelyExecute(() => this.fetchTokenList());
    });
    onPreferencesStateChange(async (preferencesState) => {
      this.useTokenDetection = preferencesState.useTokenDetection;
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
   * Fetching token list
   */
  async fetchTokenList(): Promise<void> {
    if (this.useTokenDetection) {
      await this.fetchFromDynamicTokenList();
    } else {
      await this.fetchFromStaticTokenList();
    }
  }

  /**
   * Fetching token list from the contract-metadata as a fallback
   */
  async fetchFromStaticTokenList(): Promise<void> {
    const tokenList: TokenListMap = {};
    for (const tokenAddress in contractMap) {
      const { erc20, logo: filePath, ...token } = (contractMap as ContractMap)[
        tokenAddress
      ];
      if (erc20) {
        tokenList[tokenAddress] = {
          ...token,
          address: tokenAddress,
          iconUrl: filePath,
          occurrences: null,
          aggregators: null,
        };
      }
    }
    this.update(() => {
      return {
        tokenList,
        tokensChainsCache: {},
      };
    });
  }

  /**
   * Fetching token list from the Token Service API
   */
  async fetchFromDynamicTokenList(): Promise<void> {
    const releaseLock = await this.mutex.acquire();
    try {
      const cachedTokens: TokenListToken[] | null = await safelyExecute(() =>
        this.fetchFromCache(),
      );
      const { tokensChainsCache, ...tokensData } = this.state;
      const tokenList: TokenListMap = {};
      if (cachedTokens) {
        for (const token of cachedTokens) {
          tokenList[token.address] = token;
        }
      } else {
        const tokensFromAPI: DynamicToken[] = await safelyExecute(() =>
          fetchTokenList(this.chainId),
        );
        // filtering out tokens with less than 2 occurrences
        const filteredTokenList = tokensFromAPI.filter(
          (token) => token.occurrences && token.occurrences >= 2,
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
      }
      const updatedTokensChainsCache: TokensChainsCache = {
        ...tokensChainsCache,
        [this.chainId]: {
          timestamp: Date.now(),
          data: Object.values(tokenList),
        },
      };
      this.update(() => {
        return {
          ...tokensData,
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
   *  if yes data in cache will be returned
   *  otherwise null will be returned.
   * @returns Promise that resolves into TokenListToken[] or null
   */
  async fetchFromCache(): Promise<TokenListToken[] | null> {
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
   * @returns Promise that resolves to Token Metadata
   */
  async fetchTokenMetadata(tokenAddress: string): Promise<DynamicToken> {
    const releaseLock = await this.mutex.acquire();
    try {
      const token = (await fetchTokenMetadata(
        this.chainId,
        tokenAddress,
      )) as DynamicToken;
      return token;
    } finally {
      releaseLock();
    }
  }
}

export default TokenListController;
