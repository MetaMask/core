import type { PreferencesState } from '@metamask/preferences-controller';
import {
  safelyExecute,
  toChecksumHexAddress,
} from '@metamask/controller-utils';
import {
  BaseController,
  BaseConfig,
  BaseState,
} from '@metamask/base-controller';
import type { NetworkState } from '@metamask/network-controller';
import type { TokensController, TokensState } from './TokensController';
import type { AssetsContractController } from './AssetsContractController';
import { Token } from './TokenRatesController';
import { TokenListState } from './TokenListController';
import { isTokenDetectionSupportedForNetwork } from './assetsUtil';

const DEFAULT_INTERVAL = 180000;

/**
 * @type TokenDetectionConfig
 *
 * TokenDetection configuration
 * @property interval - Polling interval used to fetch new token rates
 * @property selectedAddress - Vault selected address
 * @property chainId - The chain ID of the current network
 * @property isDetectionEnabledFromPreferences - Boolean to track if detection is enabled from PreferencesController
 * @property isDetectionEnabledForNetwork - Boolean to track if detected is enabled for current network
 */
export interface TokenDetectionConfig extends BaseConfig {
  interval: number;
  selectedAddress: string;
  chainId: string;
  isDetectionEnabledFromPreferences: boolean;
  isDetectionEnabledForNetwork: boolean;
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
  override name = 'TokenDetectionController';

  private getBalancesInSingleCall: AssetsContractController['getBalancesInSingleCall'];

  private addDetectedTokens: TokensController['addDetectedTokens'];

  private getTokensState: () => TokensState;

  private getTokenListState: () => TokenListState;

  /**
   * Creates a TokenDetectionController instance.
   *
   * @param options - The controller options.
   * @param options.onPreferencesStateChange - Allows subscribing to preferences controller state changes.
   * @param options.onNetworkStateChange - Allows subscribing to network controller state changes.
   * @param options.onTokenListStateChange - Allows subscribing to token list controller state changes.
   * @param options.getBalancesInSingleCall - Gets the balances of a list of tokens for the given address.
   * @param options.addDetectedTokens - Add a list of detected tokens.
   * @param options.getTokenListState - Gets the current state of the TokenList controller.
   * @param options.getTokensState - Gets the current state of the Tokens controller.
   * @param options.getNetworkState - Gets the state of the network controller.
   * @param options.getPreferencesState - Gets the state of the preferences controller.
   * @param config - Initial options used to configure this controller.
   * @param state - Initial state to set on this controller.
   */
  constructor(
    {
      onPreferencesStateChange,
      onNetworkStateChange,
      onTokenListStateChange,
      getBalancesInSingleCall,
      addDetectedTokens,
      getTokenListState,
      getTokensState,
      getNetworkState,
      getPreferencesState,
    }: {
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
      getNetworkState: () => NetworkState;
      getPreferencesState: () => PreferencesState;
    },
    config?: Partial<TokenDetectionConfig>,
    state?: Partial<BaseState>,
  ) {
    const {
      provider: { chainId: defaultChainId },
    } = getNetworkState();
    const { useTokenDetection: defaultUseTokenDetection } =
      getPreferencesState();

    super(config, state);
    this.defaultConfig = {
      interval: DEFAULT_INTERVAL,
      selectedAddress: '',
      disabled: true,
      chainId: defaultChainId,
      isDetectionEnabledFromPreferences: defaultUseTokenDetection,
      isDetectionEnabledForNetwork:
        isTokenDetectionSupportedForNetwork(defaultChainId),
      ...config,
    };

    this.initialize();
    this.getTokensState = getTokensState;
    this.getTokenListState = getTokenListState;
    this.addDetectedTokens = addDetectedTokens;
    this.getBalancesInSingleCall = getBalancesInSingleCall;

    onTokenListStateChange(({ tokenList }) => {
      const hasTokens = Object.keys(tokenList).length;

      if (hasTokens) {
        this.detectTokens();
      }
    });

    onPreferencesStateChange(({ selectedAddress, useTokenDetection }) => {
      const {
        selectedAddress: currentSelectedAddress,
        isDetectionEnabledFromPreferences,
      } = this.config;
      const isSelectedAddressChanged =
        selectedAddress !== currentSelectedAddress;
      const isDetectionChangedFromPreferences =
        isDetectionEnabledFromPreferences !== useTokenDetection;

      this.configure({
        isDetectionEnabledFromPreferences: useTokenDetection,
        selectedAddress,
      });

      if (
        useTokenDetection &&
        (isSelectedAddressChanged || isDetectionChangedFromPreferences)
      ) {
        this.detectTokens();
      }
    });

    onNetworkStateChange(({ provider: { chainId } }) => {
      const { chainId: currentChainId } = this.config;
      const isDetectionEnabledForNetwork =
        isTokenDetectionSupportedForNetwork(chainId);
      const isChainIdChanged = currentChainId !== chainId;

      this.configure({
        chainId,
        isDetectionEnabledForNetwork,
      });

      if (isDetectionEnabledForNetwork && isChainIdChanged) {
        this.detectTokens();
      }
    });
  }

  /**
   * Start polling for detected tokens.
   */
  async start() {
    this.configure({ disabled: false });
    await this.startPolling();
  }

  /**
   * Stop polling for detected tokens.
   */
  stop() {
    this.configure({ disabled: true });
    this.stopPolling();
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
    const {
      disabled,
      isDetectionEnabledForNetwork,
      isDetectionEnabledFromPreferences,
    } = this.config;
    if (
      disabled ||
      !isDetectionEnabledForNetwork ||
      !isDetectionEnabledFromPreferences
    ) {
      return;
    }
    const { tokens } = this.getTokensState();
    const { selectedAddress } = this.config;

    const tokensAddresses = tokens.map(
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
            const { decimals, symbol, aggregators, iconUrl } =
              tokenList[caseInsensitiveTokenKey];
            tokensToAdd.push({
              address: tokenAddress,
              decimals,
              symbol,
              aggregators,
              image: iconUrl,
              isERC721: false,
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
