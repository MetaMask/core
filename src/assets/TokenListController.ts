import type { Patch } from 'immer';
import { Mutex } from 'async-mutex';
import { isEqual } from 'lodash';
import { BaseController } from '../BaseControllerV2';
import type { RestrictedControllerMessenger } from '../ControllerMessenger';
import { safelyExecute } from '../util';
import {
  fetchTokenList,
  syncTokens,
  fetchTopAssets,
  fetchTokenMetadata,
} from '../apis/token-service';

const DEFAULT_INTERVAL = 180 * 1000;

type Token = {
  address: string;
  decimals: number;
  symbol: string;
  occurances: number;
  aggregators: string[];
};
type TopAsset = {
  address: string;
  symbol: string;
};
type TokenMap = {
  [address: string]: Token;
};
export type TokenListState = {
  tokens: TokenMap;
  topAssets: TopAsset[];
};
const name = 'TokenListController';

export type TokenListStateChange = {
  type: `${typeof name}:stateChange`;
  payload: [TokenListState, Patch[]];
};

export type GetTokenListState = {
  type: `${typeof name}:getState`;
  handler: () => TokenListState;
};
const metadata = {
  tokens: { persist: true, anonymous: true },
  topAssets: { persist: true, anonymous: true },
};
const defaultState: TokenListState = {
  tokens: {},
  topAssets: [],
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
    interval = DEFAULT_INTERVAL,
    messenger,
    state,
  }: {
    chainId: string;
    interval?: number;
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
    this.chainId = chainId;
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
    await safelyExecute(() => this.fetchTopAssets());
    this.intervalId = setInterval(async () => {
      await safelyExecute(() => this.fetchTokenList());
      await safelyExecute(() => this.fetchTopAssets());
    }, this.intervalDelay);
  }

  async fetchTokenList(): Promise<void> {
    const releaseLock = await this.mutex.acquire();
    const { tokens, ...topAssets }: TokenListState = this.state;
    try {
      const tokenList: Token[] = await safelyExecute(() =>
        fetchTokenList(this.chainId),
      );
      for (const token of tokenList) {
        const existingToken = tokens[token.address];
        if (!existingToken) {
          tokens[token.address] = token;
        } else if (!isEqual(existingToken, token)) {
          tokens[token.address] = token;
        }
      }
      this.update(() => {
        return {
          tokens,
          ...topAssets,
        };
      });
    } finally {
      releaseLock();
    }
  }

  async syncTokens(): Promise<void> {
    const releaseLock = await this.mutex.acquire();
    try {
      await safelyExecute(() => syncTokens(this.chainId));
    } finally {
      releaseLock();
    }
  }

  async fetchTopAssets(): Promise<void> {
    const releaseLock = await this.mutex.acquire();
    try {
      const { topAssets, ...tokens } = this.state;
      const assets = await safelyExecute(() => fetchTopAssets(this.chainId));
      this.update(() => {
        return {
          ...tokens,
          topAssets: assets,
        };
      });
    } finally {
      releaseLock();
    }
  }

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
