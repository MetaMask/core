import type { Patch } from 'immer';
import { Mutex } from 'async-mutex';
import { BaseController } from '../BaseControllerV2';
import type { RestrictedControllerMessenger } from '../ControllerMessenger';
import { safelyExecute, timeoutFetch } from '../util';
import { Token } from './TokenRatesController';

const DEFAULT_INTERVAL = 180 * 1000;

export type TokenListMap = {
  [address: string]: Token;
};
export type TokenListState = {
  tokens: TokenListMap;
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
};
const defaultState: any = {
  tokens: {},
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

  /**
   * Creates a TokenListController instance
   *
   * @param options - Constructor options
   * @param options.interval - The polling interval, in milliseconds
   * @param options.messenger - A reference to the messaging system
   * @param options.state - Initial state to set on this controller
   */
  constructor({
    interval = DEFAULT_INTERVAL,
    messenger,
    state,
  }: {
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

  private async fetchTokenList(): Promise<TokenListState | void> {
    const releaseLock = await this.mutex.acquire();
    const { tokens }: { tokens: TokenListMap } = this.state;
    try {
      const tokensResponse = await safelyExecute(() =>
        this.metaswapsTokenQuery(),
      );
      const tokenList: Token[] = await tokensResponse.json();

      for (const token of tokenList) {
        if (!tokens[token.address]) {
          tokens[token.address] = token;
        }
      }
    } catch (error) {
      throw new Error(`Unable to fetch token list.${error}`);
    } finally {
      try {
        this.update(() => {
          tokens;
        });
      } finally {
        releaseLock();
      }
    }
    return this.state;
  }

  private async metaswapsTokenQuery(): Promise<Response> {
    const url = `https://metaswap-api.airswap-dev.codefi.network/tokens`;
    const fetchOptions: RequestInit = {
      referrer: url,
      referrerPolicy: 'no-referrer-when-downgrade',
      method: 'GET',
      mode: 'cors',
    };
    if (!(fetchOptions.headers instanceof window.Headers)) {
      fetchOptions.headers = new window.Headers(fetchOptions.headers);
    }
    fetchOptions.headers.set('Content-Type', 'application/json');
    return await timeoutFetch(url, fetchOptions);
  }
}
