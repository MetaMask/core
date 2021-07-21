import type { Patch } from 'immer';
import { Mutex } from 'async-mutex';
import { BaseController } from '../BaseControllerV2';
import type { RestrictedControllerMessenger } from '../ControllerMessenger';
import { getImageFromContractMetadata, safelyExecute } from '../util';
import {
  fetchTokenList,
  syncTokens,
  fetchTokenMetadata,
} from '../apis/token-service';
import { NetworkState } from '../network/NetworkController';
import { PreferencesState } from '../user/PreferencesController';
const contractMap: ContractMap = require('@metamask/contract-metadata');

const DEFAULT_INTERVAL = 60 * 60 * 1000;
const DEFAULT_THRESHOLD = 60 * 30 * 1000;

const name = 'TokenListController';

interface DataCache {
  timestamp: number;
  data: TokenListToken[];
}
interface TokensChainsCache {
  [chainSlug: string]: DataCache;
}

type BaseToken = {
  name: string;
  symbol: string;
  decimals: number;
}

type LegacyToken = {
  logo: string;
  erc20: boolean;
} & BaseToken;

export type ContractMap = {
  [address: string]: LegacyToken
}

export type TokenListToken = {
  address: string;
  occurrences: number | null;
  aggregators: string[] | null;
  iconUrl: string;
} & BaseToken;


export type TokenMap = {
  [address: string]: TokenListToken;
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

  private useStaticTokenList: boolean;

  private staticTokenRootImagePath: string;

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
    useStaticTokenList,
    onNetworkStateChange,
    onPreferencesStateChange,
    interval = DEFAULT_INTERVAL,
    cacheRefreshThreshold = DEFAULT_THRESHOLD,
    messenger,
    state,
    staticTokenRootImagePath,
  }: {
    chainId: string;
    useStaticTokenList: boolean;
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
    staticTokenRootImagePath: string;
  }) {
    super({
      name,
      metadata,
      messenger,
      state: { ...defaultState, ...state },
    });
    this.staticTokenRootImagePath = staticTokenRootImagePath;
    this.intervalDelay = interval;
    this.cacheRefreshThreshold = cacheRefreshThreshold;
    this.chainId = chainId;
    this.useStaticTokenList = useStaticTokenList;
    onNetworkStateChange(async (networkState) => {
      this.chainId = networkState.provider.chainId;
      await safelyExecute(() => this.fetchTokenList());
    });
    onPreferencesStateChange(async (preferencesState) => {
      this.useStaticTokenList = preferencesState.useStaticTokenList;
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
    if (this.useStaticTokenList) {
      await this.fetchFromStaticTokenList();
    } else {
      await this.fetchFromDynamicTokenList();
    }
  }

  /**
   * Fetching token list from the contract-metadata as a fallback
   */
  async fetchFromStaticTokenList(): Promise<void> {
    const tokenList: TokenMap = {};
    for (const tokenAddress in contractMap) {
      const { erc20, logo: filePath, ...token } = contractMap[tokenAddress];
      const iconUrl = getImageFromContractMetadata({rootPath: this.staticTokenRootImagePath, filePath});
      if (erc20) {
        tokenList[tokenAddress] = { ...token, iconUrl, address: tokenAddress, occurrences: null, aggregators: null };
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
      const tokensFromAPI: TokenListToken[] = await safelyExecute(() =>
        this.fetchFromCache(),
      );
      const { tokensChainsCache } = this.state;
      const tokenList: TokenMap = {};

      // filtering out tokens with less than 2 occurences
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
  async fetchFromCache(): Promise<TokenListToken[]> {
    const { tokensChainsCache, ...tokensData }: TokenListState = this.state;
    const dataCache = tokensChainsCache[this.chainId];
    const now = Date.now();
    if (
      dataCache?.data &&
      now - dataCache?.timestamp < this.cacheRefreshThreshold
    ) {
      return dataCache.data;
    }
    const tokenList: TokenListToken[] = await safelyExecute(() =>
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
   * @returns Promise that resolves to Token Metadata
   */
  async fetchTokenMetadata(tokenAddress: string): Promise<TokenListToken> {
    const releaseLock = await this.mutex.acquire();
    try {
      const token: TokenListToken = await safelyExecute(() =>
        fetchTokenMetadata(this.chainId, tokenAddress),
      );
      return token;
    } finally {
      releaseLock();
    }
  }
}

export default TokenListController;
