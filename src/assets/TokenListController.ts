import { BaseController } from '../BaseControllerV2';
import type { RestrictedControllerMessenger } from '../ControllerMessenger';
import { Token } from './TokenRatesController';
import type { Patch } from 'immer';
import { safelyExecute, timeoutFetch } from '../util';
import { Mutex } from 'async-mutex';

const DEFAULT_INTERVAL = 180 * 1000;

export type TokenListMap = {
    [address: string]: Token;
}
export type TokenListState = {
    tokens: TokenListMap;
}
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
 * Controller that passively polls on a set interval for an exchange rate from the current base
 * asset to the current currency
 */
 export class TokenListController extends BaseController<
 typeof name,
 TokenListState
> {
    private mutex = new Mutex();

    private intervalId?: NodeJS.Timeout;

    private intervalDelay: number;
    /**
   * Creates a CurrencyRateController instance
   *
   * @param options - Constructor options
   * @param options.includeUsdRate - Keep track of the USD rate in addition to the current currency rate
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
    // TODO: Expose polling currency rate update errors
    await safelyExecute(() => this.fetchTokenList());
    this.intervalId = setInterval(async () => {
      await safelyExecute(() =>  this.fetchTokenList());
    }, this.intervalDelay);
    console.log(this.intervalId)
  }

  private async fetchTokenList(): Promise<void> {
    const releaseLock = await this.mutex.acquire();
    try{
      const tokensResponse = await safelyExecute(() => this.metaswapsTokenQuery())
      const tokenList: Token[] = await tokensResponse.json();
      const apiTokens: TokenListMap = this.state.tokens;
      for(const token of tokenList){
        if(!apiTokens[token.address]){
          apiTokens[token.address] = token;
        }
      }
      this.update(() =>  {
        tokens: apiTokens
      })
    } finally{
      releaseLock();
    }
  }
  private async metaswapsTokenQuery(): Promise<Response> {
    const url = `https://metaswap-api.airswap-dev.codefi.network/tokens`;
    const fetchOptions: RequestInit = {
        referrer: url,
        referrerPolicy: 'no-referrer-when-downgrade',
        method: 'GET',
        mode: 'cors',
    }
    if (!(fetchOptions.headers instanceof window.Headers)) {
        fetchOptions.headers = new window.Headers(fetchOptions.headers);
    }
    fetchOptions.headers.set('Content-Type', 'application/json');
    return await timeoutFetch(
      url,
      fetchOptions
    );
  }
}