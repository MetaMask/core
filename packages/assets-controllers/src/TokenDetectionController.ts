import type { BaseConfig, BaseState } from '@metamask/base-controller';
import {
  safelyExecute,
  toChecksumHexAddress,
} from '@metamask/controller-utils';
import type {
  NetworkClientId,
  NetworkController,
  NetworkState,
} from '@metamask/network-controller';
import { PollingControllerV1 } from '@metamask/polling-controller';
import type { PreferencesState } from '@metamask/preferences-controller';
import type { Hex } from '@metamask/utils';

import type { AssetsContractController } from './AssetsContractController';
import { isTokenDetectionSupportedForNetwork } from './assetsUtil';
import type { TokenListState } from './TokenListController';
import type { Token } from './TokenRatesController';
import type { TokensController, TokensState } from './TokensController';

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
  chainId: Hex;
  isDetectionEnabledFromPreferences: boolean;
  isDetectionEnabledForNetwork: boolean;
}

/**
 * Controller that passively polls on a set interval for Tokens auto detection
 */
export class TokenDetectionController extends PollingControllerV1<
  TokenDetectionConfig,
  BaseState
> {
  private intervalId?: ReturnType<typeof setTimeout>;

  /**
   * Name of this controller used during composition
   */
  override name = 'TokenDetectionController';

  private readonly getBalancesInSingleCall: AssetsContractController['getBalancesInSingleCall'];

  private readonly addDetectedTokens: TokensController['addDetectedTokens'];

  private readonly getTokensState: () => TokensState;

  private readonly getTokenListState: () => TokenListState;

  private readonly getNetworkClientById: NetworkController['getNetworkClientById'];

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
   * @param options.getNetworkClientById - Gets the network client by ID.
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
      getNetworkClientById,
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
      getNetworkClientById: NetworkController['getNetworkClientById'];
    },
    config?: Partial<TokenDetectionConfig>,
    state?: Partial<BaseState>,
  ) {
    const {
      providerConfig: { chainId: defaultChainId },
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
    this.getNetworkClientById = getNetworkClientById;

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

    onNetworkStateChange(({ providerConfig: { chainId } }) => {
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

  private getCorrectChainId(networkClientId?: NetworkClientId) {
    if (networkClientId) {
      return this.getNetworkClientById(networkClientId).configuration.chainId;
    }
    return this.config.chainId;
  }

  _executePoll(
    networkClientId: string,
    options: { address: string },
  ): Promise<void> {
    return this.detectTokens({
      networkClientId,
      accountAddress: options.address,
    });
  }

  /**
   * Triggers asset ERC20 token auto detection for each contract address in contract metadata on mainnet.
   *
   * @param options - Options to detect tokens.
   * @param options.networkClientId - The ID of the network client to use.
   * @param options.accountAddress - The account address to use.
   */
  async detectTokens(options?: {
    networkClientId?: NetworkClientId;
    accountAddress?: string;
  }) {
    const { networkClientId, accountAddress } = options || {};
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
    const selectedAddress = accountAddress || this.config.selectedAddress;
    const chainId = this.getCorrectChainId(networkClientId);

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
            const { decimals, symbol, aggregators, iconUrl, name } =
              tokenList[caseInsensitiveTokenKey];
            tokensToAdd.push({
              address: tokenAddress,
              decimals,
              symbol,
              aggregators,
              image: iconUrl,
              isERC721: false,
              name,
            });
          }
        }

        if (tokensToAdd.length) {
          await this.addDetectedTokens(tokensToAdd, {
            selectedAddress,
            chainId,
          });
        }
      });
    }
  }
}

export default TokenDetectionController;
