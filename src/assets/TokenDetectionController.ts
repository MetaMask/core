import { BaseController, BaseConfig, BaseState } from '../BaseController';
import type { NetworkState, NetworkType } from '../network/NetworkController';
import type { PreferencesState } from '../user/PreferencesController';
import { safelyExecute, toChecksumHexAddress } from '../util';
import { MAINNET } from '../constants';

import type { TokensController, TokensState } from './TokensController';
import type { AssetsContractController } from './AssetsContractController';
import { Token } from './TokenRatesController';
import { TokenListState } from './TokenListController';

const DEFAULT_INTERVAL = 180000;

/**
 * @type TokenDetectionConfig
 *
 * TokenDetection configuration
 * @property interval - Polling interval used to fetch new token rates
 * @property networkType - Network type ID as per net_version
 * @property selectedAddress - Vault selected address
 * @property tokens - List of tokens associated with the active vault
 */
export interface TokenDetectionConfig extends BaseConfig {
  interval: number;
  networkType: NetworkType;
  selectedAddress: string;
  tokens: Token[];
}

/**
 * Controller that passively polls on a set interval for Tokens auto detection
 */
export class TokenDetectionController extends BaseController<
  TokenDetectionConfig,
  BaseState
> {
  private intervalId?: NodeJS.Timeout;

  /**
   * Name of this controller used during composition
   */
  name = 'TokenDetectionController';

  private getBalancesInSingleCall: AssetsContractController['getBalancesInSingleCall'];

  private addTokens: TokensController['addTokens'];

  private getTokensState: () => TokensState;

  private getTokenListState: () => TokenListState;

  /**
   * Creates a TokenDetectionController instance.
   *
   * @param options - The controller options.
   * @param options.onTokensStateChange - Allows subscribing to tokens controller state changes.
   * @param options.onPreferencesStateChange - Allows subscribing to preferences controller state changes.
   * @param options.onNetworkStateChange - Allows subscribing to network controller state changes.
   * @param options.getBalancesInSingleCall - Gets the balances of a list of tokens for the given address.
   * @param options.addTokens - Add a list of tokens.
   * @param options.getTokenListState - Gets the current state of the TokenList controller.
   * @param options.getTokensState - Gets the current state of the Tokens controller.
   * @param config - Initial options used to configure this controller.
   * @param state - Initial state to set on this controller.
   */
  constructor(
    {
      onTokensStateChange,
      onPreferencesStateChange,
      onNetworkStateChange,
      getBalancesInSingleCall,
      addTokens,
      getTokenListState,
      getTokensState,
    }: {
      onTokensStateChange: (
        listener: (tokensState: TokensState) => void,
      ) => void;
      onPreferencesStateChange: (
        listener: (preferencesState: PreferencesState) => void,
      ) => void;
      onNetworkStateChange: (
        listener: (networkState: NetworkState) => void,
      ) => void;
      getBalancesInSingleCall: AssetsContractController['getBalancesInSingleCall'];
      addTokens: TokensController['addTokens'];
      getTokenListState: () => TokenListState;
      getTokensState: () => TokensState;
    },
    config?: Partial<TokenDetectionConfig>,
    state?: Partial<BaseState>,
  ) {
    super(config, state);
    this.defaultConfig = {
      interval: DEFAULT_INTERVAL,
      networkType: MAINNET,
      selectedAddress: '',
      tokens: [],
    };
    this.initialize();
    this.getTokensState = getTokensState;
    this.getTokenListState = getTokenListState;
    this.addTokens = addTokens;
    onTokensStateChange(({ tokens }) => {
      this.configure({ tokens });
    });

    onPreferencesStateChange(({ selectedAddress }) => {
      const actualSelectedAddress = this.config.selectedAddress;
      if (selectedAddress !== actualSelectedAddress) {
        this.configure({ selectedAddress });
        this.detectTokens();
      }
    });

    onNetworkStateChange(({ provider }) => {
      this.configure({ networkType: provider.type });
    });
    this.getBalancesInSingleCall = getBalancesInSingleCall;
    this.start();
  }

  /**
   * Start polling for the currency rate.
   */
  async start() {
    await this.startPolling();
  }

  /**
   * Stop polling for the currency rate.
   */
  stop() {
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
  private async startPolling(interval?: number): Promise<void> {
    interval && this.configure({ interval }, false, false);
    this.stopPolling();
    await this.detectTokens();
    this.intervalId = setInterval(async () => {
      await this.detectTokens();
    }, this.config.interval);
  }

  /**
   * Checks whether network is mainnet or not.
   *
   * @returns Whether current network is mainnet.
   */
  isMainnet() {
    if (this.config.networkType !== MAINNET || this.disabled) {
      return false;
    }
    return true;
  }

  /**
   * Triggers asset ERC20 token auto detection for each contract address in contract metadata on mainnet.
   */
  async detectTokens() {
    /* istanbul ignore if */
    if (!this.isMainnet()) {
      return;
    }
    const tokensAddresses = this.config.tokens.map(
      /* istanbul ignore next*/ (token) => token.address.toLowerCase(),
    );
    const { tokenList } = this.getTokenListState();
    const tokensToDetect: string[] = [];
    for (const address in tokenList) {
      if (!tokensAddresses.includes(address)) {
        tokensToDetect.push(address);
      }
    }
    const sliceOfTokensToDetect = [];
    sliceOfTokensToDetect[0] = tokensToDetect.slice(0, 1000);
    sliceOfTokensToDetect[1] = tokensToDetect.slice(
      1000,
      tokensToDetect.length - 1,
    );

    const { selectedAddress } = this.config;
    /* istanbul ignore else */
    if (!selectedAddress) {
      return;
    }

    for (const tokensSlice of sliceOfTokensToDetect) {
      if (tokensSlice.length === 0) {
        break;
      }

      await safelyExecute(async () => {
        const balances = await this.getBalancesInSingleCall(
          selectedAddress,
          tokensSlice,
        );
        const tokensToAdd = [];
        for (const tokenAddress in balances) {
          let ignored;
          /* istanbul ignore else */
          const { ignoredTokens } = this.getTokensState();
          if (ignoredTokens.length) {
            ignored = ignoredTokens.find(
              (ignoredTokenAddress) =>
                ignoredTokenAddress === toChecksumHexAddress(tokenAddress),
            );
          }
          const caseInsensitiveTokenKey =
            Object.keys(tokenList).find(
              (i) => i.toLowerCase() === tokenAddress.toLowerCase(),
            ) || '';

          if (ignored === undefined) {
            tokensToAdd.push({
              address: tokenAddress,
              decimals: tokenList[caseInsensitiveTokenKey].decimals,
              symbol: tokenList[caseInsensitiveTokenKey].symbol,
            });
          }
        }

        if (tokensToAdd.length) {
          await this.addTokens(tokensToAdd);
        }
      });
    }
  }
}

export default TokenDetectionController;
