import type {
  RestrictedControllerMessenger,
  ControllerGetStateAction,
  ControllerStateChangeEvent,
} from '@metamask/base-controller';
import {
  safelyExecute,
  toChecksumHexAddress,
} from '@metamask/controller-utils';
import type {
  NetworkClientId,
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerGetStateAction,
  NetworkControllerStateChangeEvent,
  NetworkState,
} from '@metamask/network-controller';
import { PollingController } from '@metamask/polling-controller';
import type { PreferencesState } from '@metamask/preferences-controller';
import type { Hex } from '@metamask/utils';

import type { AssetsContractController } from './AssetsContractController';
import { isTokenDetectionSupportedForNetwork } from './assetsUtil';
import type {
  GetTokenListState,
  TokenListStateChange,
} from './TokenListController';
import type { Token } from './TokenRatesController';
import type { TokensController, TokensState } from './TokensController';

const DEFAULT_INTERVAL = 180000;

/**
 * @type TokenDetectionState
 *
 * TokenDetection state
 * @property interval - Polling interval used to fetch new token rates
 * @property selectedAddress - Vault selected address
 * @property chainId - The chain ID of the current network
 * @property disabled - Determines if this controller is enabled
 * @property isDetectionEnabledFromPreferences - Boolean to track if detection is enabled from PreferencesController
 * @property isDetectionEnabledForNetwork - Boolean to track if detected is enabled for current network
 */
export type TokenDetectionState = {
  interval: number;
  selectedAddress: string;
  chainId: Hex;
  disabled: boolean;
  isDetectionEnabledFromPreferences: boolean;
  isDetectionEnabledForNetwork: boolean;
};

const controllerName = 'TokenDetectionController';

export type TokenDetectionControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  TokenDetectionState
>;

export type TokenDetectionControllerActions =
  TokenDetectionControllerGetStateAction;

type AllowedActions =
  | NetworkControllerGetStateAction
  | NetworkControllerGetNetworkClientByIdAction
  | GetTokenListState;

export type TokenDetectionControllerStateChangeEvent =
  ControllerStateChangeEvent<typeof controllerName, TokenDetectionState>;

export type TokenDetectionControllerEvents =
  TokenDetectionControllerStateChangeEvent;

type AllowedEvents = NetworkControllerStateChangeEvent | TokenListStateChange;

export type TokenDetectionControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  TokenDetectionControllerActions | AllowedActions,
  TokenDetectionControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

/**
 * Controller that passively polls on a set interval for Tokens auto detection
 */
export class TokenDetectionController extends PollingController<
  typeof controllerName,
  TokenDetectionState,
  TokenDetectionControllerMessenger
> {
  private intervalId?: ReturnType<typeof setTimeout>;

  /**
   * Name of this controller used during composition
   */

  private readonly getBalancesInSingleCall: AssetsContractController['getBalancesInSingleCall'];

  private readonly addDetectedTokens: TokensController['addDetectedTokens'];

  private readonly getTokensState: () => TokensState;

  /**
   * Creates a TokenDetectionController instance.
   *
   * @param options - The controller options.
   * @param options.onPreferencesStateChange - Allows subscribing to preferences controller state changes.
   * @param options.getBalancesInSingleCall - Gets the balances of a list of tokens for the given address.
   * @param options.addDetectedTokens - Add a list of detected tokens.
   * @param options.getTokensState - Gets the current state of the Tokens controller.
   * @param options.getNetworkState - Gets the state of the network controller.
   * @param options.getPreferencesState - Gets the state of the preferences controller.
   * @param options.messenger - The controller messaging system.
   * @param options.state - Initial state to set on this controller.
   */
  constructor({
    onPreferencesStateChange,
    getBalancesInSingleCall,
    addDetectedTokens,
    getTokensState,
    getNetworkState,
    getPreferencesState,
    messenger,
    state,
  }: {
    onPreferencesStateChange: (
      listener: (preferencesState: PreferencesState) => void,
    ) => void;
    getBalancesInSingleCall: AssetsContractController['getBalancesInSingleCall'];
    addDetectedTokens: TokensController['addDetectedTokens'];
    getTokensState: () => TokensState;
    getNetworkState: () => NetworkState;
    getPreferencesState: () => PreferencesState;
    messenger: TokenDetectionControllerMessenger;
    state?: TokenDetectionState;
  }) {
    const {
      providerConfig: { chainId: defaultChainId },
    } = getNetworkState();
    const { useTokenDetection: defaultUseTokenDetection } =
      getPreferencesState();

    super({
      name: controllerName,
      messenger,
      state: {
        interval: DEFAULT_INTERVAL,
        selectedAddress: '',
        disabled: true,
        chainId: defaultChainId,
        isDetectionEnabledFromPreferences: defaultUseTokenDetection,
        isDetectionEnabledForNetwork:
          isTokenDetectionSupportedForNetwork(defaultChainId),
        ...state,
      },
      metadata: {
        interval: { persist: true, anonymous: false },
        selectedAddress: { persist: true, anonymous: false },
        chainId: { persist: true, anonymous: false },
        disabled: { persist: true, anonymous: false },
        isDetectionEnabledFromPreferences: { persist: true, anonymous: false },
        isDetectionEnabledForNetwork: { persist: true, anonymous: false },
      },
    });

    this.getTokensState = getTokensState;
    this.addDetectedTokens = addDetectedTokens;
    this.getBalancesInSingleCall = getBalancesInSingleCall;

    this.messagingSystem.subscribe(
      'TokenListController:stateChange',
      ({ tokenList }) => {
        const hasTokens = Object.keys(tokenList).length;

        if (hasTokens) {
          this.detectTokens();
        }
      },
    );

    onPreferencesStateChange(({ selectedAddress, useTokenDetection }) => {
      const {
        selectedAddress: currentSelectedAddress,
        isDetectionEnabledFromPreferences,
      } = this.state;
      const isSelectedAddressChanged =
        selectedAddress !== currentSelectedAddress;
      const isDetectionChangedFromPreferences =
        isDetectionEnabledFromPreferences !== useTokenDetection;

      this.update(() => ({
        ...this.state,
        isDetectionEnabledFromPreferences: useTokenDetection,
        selectedAddress,
      }));

      if (
        useTokenDetection &&
        (isSelectedAddressChanged || isDetectionChangedFromPreferences)
      ) {
        this.detectTokens();
      }
    });

    this.messagingSystem.subscribe(
      'NetworkController:stateChange',
      ({ providerConfig: { chainId } }) => {
        const { chainId: currentChainId } = this.state;
        const isDetectionEnabledForNetwork =
          isTokenDetectionSupportedForNetwork(chainId);
        const isChainIdChanged = currentChainId !== chainId;

        this.update(() => ({
          ...this.state,
          chainId,
          isDetectionEnabledForNetwork,
        }));

        if (isDetectionEnabledForNetwork && isChainIdChanged) {
          this.detectTokens();
        }
      },
    );
  }

  /**
   * Start polling for detected tokens.
   */
  async start() {
    this.update(() => ({ ...this.state, disabled: false }));
    await this.startPolling();
  }

  /**
   * Stop polling for detected tokens.
   */
  stop() {
    this.update(() => ({ ...this.state, disabled: true }));
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
    interval && this.update(() => ({ ...this.state, interval }));
    this.stopPolling();
    await this.detectTokens();
    this.intervalId = setInterval(async () => {
      await this.detectTokens();
    }, this.state.interval);
  }

  private getCorrectChainId(networkClientId?: NetworkClientId) {
    if (networkClientId) {
      const {
        configuration: { chainId },
      } = this.messagingSystem.call(
        'NetworkController:getNetworkClientById',
        networkClientId,
      );
      return chainId;
    }
    return this.state.chainId;
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
    const { networkClientId, accountAddress } = options ?? {};
    const {
      disabled,
      isDetectionEnabledForNetwork,
      isDetectionEnabledFromPreferences,
    } = this.state;
    if (
      disabled ||
      !isDetectionEnabledForNetwork ||
      !isDetectionEnabledFromPreferences
    ) {
      return;
    }
    const { tokens } = this.getTokensState();
    const selectedAddress = accountAddress ?? this.state.selectedAddress;
    const chainId = this.getCorrectChainId(networkClientId);

    const tokensAddresses = tokens.map(
      /* istanbul ignore next*/ (token) => token.address.toLowerCase(),
    );
    const { tokenList } = this.messagingSystem.call(
      'TokenListController:getState',
    );
    const tokensToDetect: string[] = [];
    for (const address of Object.keys(tokenList)) {
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
        for (const tokenAddress of Object.keys(balances)) {
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
