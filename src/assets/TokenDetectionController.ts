// eslint-disable-next-line import/no-named-as-default
import AbortController from 'abort-controller';
import { BaseController, BaseConfig, BaseState } from '../BaseController';
import type { NetworkState, NetworkType } from '../network/NetworkController';
import type { PreferencesState } from '../user/PreferencesController';
import {
  safelyExecute,
  toChecksumHexAddress,
  isTokenDetectionEnabledForNetwork,
} from '../util';
import { MAINNET } from '../constants';
import { NetworksChainId } from '..';
import type { TokensController, TokensState } from './TokensController';
import type { AssetsContractController } from './AssetsContractController';
import { Token } from './TokenListController';
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
  chainId: string;
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

  private addDetectedTokens: TokensController['addDetectedTokens'];

  private getTokensState: () => TokensState;

  private getTokenListState: () => TokenListState;

  private abortController: AbortController;

  /**
   * Creates a TokenDetectionController instance.
   *
   * @param options - The controller options.
   * @param options.onTokensStateChange - Allows subscribing to tokens controller state changes.
   * @param options.onPreferencesStateChange - Allows subscribing to preferences controller state changes.
   * @param options.onNetworkStateChange - Allows subscribing to network controller state changes.
   * @param options.onTokenListStateChange - Allows subscribing to token list controller state changes.
   * @param options.getBalancesInSingleCall - Gets the balances of a list of tokens for the given address.
   * @param options.addDetectedTokens - Add a list of detected tokens.
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
      onTokenListStateChange,
      getBalancesInSingleCall,
      addDetectedTokens,
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
      onTokenListStateChange: (
        listener: (tokenListState: TokenListState) => void,
      ) => void;
      getBalancesInSingleCall: AssetsContractController['getBalancesInSingleCall'];
      addDetectedTokens: TokensController['addDetectedTokens'];
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
      disabled: true,
      chainId: NetworksChainId.mainnet,
    };
    this.initialize();
    this.getTokensState = getTokensState;
    this.getTokenListState = getTokenListState;
    this.addDetectedTokens = addDetectedTokens;
    this.abortController = new AbortController();
    onTokensStateChange(({ tokens }) => {
      this.configure({ tokens });
    });

    onPreferencesStateChange(({ selectedAddress, useTokenDetection }) => {
      const prevDisabled = this.config.disabled;
      const prevSelectedAddress = this.config.selectedAddress;
      const isTokenDetectionSupported = isTokenDetectionEnabledForNetwork(
        this.config.chainId,
      );
      const isDetectionEnabled = useTokenDetection && isTokenDetectionSupported;
      this.configure({ selectedAddress, disabled: !isDetectionEnabled });
      // Check if detection state or selected address has changed
      if (
        isDetectionEnabled &&
        (prevDisabled || selectedAddress !== prevSelectedAddress)
      ) {
        this.detectTokens();
      }
    });

    onNetworkStateChange(async (networkState) => {
      if (this.config.chainId !== networkState.provider.chainId) {
        this.abortController.abort();
        this.abortController = new AbortController();
        const incomingChainId = networkState.provider.chainId;
        const isTokenDetectionSupported = isTokenDetectionEnabledForNetwork(
          incomingChainId,
        );
        const isDetectionEnabled =
          isTokenDetectionSupported && !this.config.disabled;
        this.configure({
          networkType: networkState.provider.type,
          chainId: incomingChainId,
          disabled: !isDetectionEnabled,
        });

        if (isDetectionEnabled) {
          await this.restart();
        } else {
          this.stopPolling();
        }
      }
    });

    onTokenListStateChange(({ tokenList }) => {
      // Detect tokens when token list has been updated and is populated
      if (Object.keys(tokenList).length) {
        this.detectTokens();
      }
    });
    this.getBalancesInSingleCall = getBalancesInSingleCall;
  }

  /**
   * Start polling for the currency rate.
   */
  async start() {
    if (this.config.disabled) {
      return;
    }

    await this.startPolling();
  }

  /**
   * Stop polling for the currency rate.
   */
  stop() {
    this.stopPolling();
  }

  /**
   * Restart polling for the token list.
   */
  async restart() {
    this.stopPolling();
    await this.startPolling();
  }

  private stopPolling() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  /**
   * Starts a new polling interval.
   *
   * @param interval - An interval on which to poll.
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
   * Triggers asset ERC20 token auto detection for each contract address in contract metadata on mainnet.
   */
  async detectTokens() {
    /* istanbul ignore if */
    if (this.config.disabled) {
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
        const tokensToAdd: Token[] = [];
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
              aggregators: tokenList[caseInsensitiveTokenKey].aggregators,
            });
          }
        }

        if (tokensToAdd.length) {
          await this.addDetectedTokens(tokensToAdd);
        }
      });
    }
  }
}

export default TokenDetectionController;
