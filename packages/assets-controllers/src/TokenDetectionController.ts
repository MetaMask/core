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

export const controllerName = 'TokenDetectionController';

export type TokenDetectionState = Record<never, never>;

export type TokenDetectionControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  TokenDetectionState
>;

export type TokenDetectionControllerActions =
  TokenDetectionControllerGetStateAction;

export type AllowedActions =
  | NetworkControllerGetStateAction
  | NetworkControllerGetNetworkClientByIdAction
  | GetTokenListState;

export type TokenDetectionControllerStateChangeEvent =
  ControllerStateChangeEvent<typeof controllerName, TokenDetectionState>;

export type TokenDetectionControllerEvents =
  TokenDetectionControllerStateChangeEvent;

export type AllowedEvents =
  | NetworkControllerStateChangeEvent
  | TokenListStateChange;

export type TokenDetectionControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  TokenDetectionControllerActions | AllowedActions,
  TokenDetectionControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

/**
 * Controller that passively polls on a set interval for Tokens auto detection
 * @property disabled - Determines if this controller is enabled
 * @property interval - Polling interval used to fetch new token rates
 * @property selectedAddress - Vault selected address
 * @property chainId - The chain ID of the current network
 * @property isDetectionEnabledFromPreferences - Boolean to track if detection is enabled from PreferencesController
 * @property isDetectionEnabledForNetwork - Boolean to track if detected is enabled for current network
 */
export class TokenDetectionController extends PollingController<
  typeof controllerName,
  TokenDetectionState,
  TokenDetectionControllerMessenger
> {
  #disabled = true;

  #intervalId?: ReturnType<typeof setTimeout>;

  #chainId: Hex;

  #selectedAddress: string;

  #isDetectionEnabledFromPreferences: boolean;

  #isDetectionEnabledForNetwork: boolean;

  /**
   * Name of this controller used during composition
   */

  readonly #getBalancesInSingleCall: AssetsContractController['getBalancesInSingleCall'];

  readonly #addDetectedTokens: TokensController['addDetectedTokens'];

  readonly #getTokensState: () => TokensState;

  /**
   * Creates a TokenDetectionController instance.
   *
   * @param options - The controller options.
   * @param options.messenger - The controller messaging system.
   * @param options.interval - Polling interval used to fetch new token rates
   * @param options.chainId - The chain ID of the current network
   * @param options.selectedAddress - Vault selected address
   * @param options.onPreferencesStateChange - Allows subscribing to preferences controller state changes.
   * @param options.getBalancesInSingleCall - Gets the balances of a list of tokens for the given address.
   * @param options.addDetectedTokens - Add a list of detected tokens.
   * @param options.getTokensState - Gets the current state of the Tokens controller.
   * @param options.getPreferencesState - Gets the state of the preferences controller.
   */
  constructor({
    chainId,
    selectedAddress = '',
    interval = DEFAULT_INTERVAL,
    onPreferencesStateChange,
    getBalancesInSingleCall,
    addDetectedTokens,
    getTokensState,
    getPreferencesState,
    messenger,
  }: {
    chainId: Hex;
    selectedAddress?: string;
    interval?: number;
    onPreferencesStateChange: (
      listener: (preferencesState: PreferencesState) => void,
    ) => void;
    getBalancesInSingleCall: AssetsContractController['getBalancesInSingleCall'];
    addDetectedTokens: TokensController['addDetectedTokens'];
    getTokensState: () => TokensState;
    getPreferencesState: () => PreferencesState;
    messenger: TokenDetectionControllerMessenger;
  }) {
    const { useTokenDetection: defaultUseTokenDetection } =
      getPreferencesState();

    super({
      name: controllerName,
      messenger,
      state: {},
      metadata: {},
    });

    this.setIntervalLength(interval);
    this.#chainId = chainId;
    this.#selectedAddress = selectedAddress;

    this.#getTokensState = getTokensState;
    this.#addDetectedTokens = addDetectedTokens;
    this.#getBalancesInSingleCall = getBalancesInSingleCall;

    this.messagingSystem.unregisterActionHandler(
      'TokenDetectionController:getState',
    );

    this.messagingSystem.subscribe(
      'TokenListController:stateChange',
      ({ tokenList }) => {
        const hasTokens = Object.keys(tokenList).length;

        if (hasTokens) {
          this.detectTokens();
        }
      },
    );

    onPreferencesStateChange(
      ({ selectedAddress: newSelectedAddress, useTokenDetection }) => {
        const isSelectedAddressChanged =
          this.#selectedAddress !== newSelectedAddress;
        const isDetectionChangedFromPreferences =
          this.#isDetectionEnabledFromPreferences !== useTokenDetection;

        this.#selectedAddress = newSelectedAddress;
        this.#isDetectionEnabledFromPreferences = useTokenDetection;

        if (
          useTokenDetection &&
          (isSelectedAddressChanged || isDetectionChangedFromPreferences)
        ) {
          this.detectTokens();
        }
      },
    );

    this.messagingSystem.subscribe(
      'NetworkController:stateChange',
      ({ providerConfig: { chainId: newChainId } }) => {
        this.#isDetectionEnabledForNetwork =
          isTokenDetectionSupportedForNetwork(newChainId);
        const isChainIdChanged = this.#chainId !== newChainId;

        this.#chainId = newChainId;

        if (this.#isDetectionEnabledForNetwork && isChainIdChanged) {
          this.detectTokens();
        }
      },
    );

    this.#isDetectionEnabledFromPreferences = defaultUseTokenDetection;
    this.#isDetectionEnabledForNetwork = isTokenDetectionSupportedForNetwork(
      this.#chainId,
    );
  }

  /**
   * Start polling for detected tokens.
   */
  async start() {
    this.#disabled = false;
    await this.#startPolling();
  }

  /**
   * Stop polling for detected tokens.
   */
  stop() {
    this.#disabled = true;
    this.#stopPolling();
  }

  #stopPolling() {
    if (this.#intervalId) {
      clearInterval(this.#intervalId);
    }
  }

  /**
   * Starts a new polling interval.
   */
  async #startPolling(): Promise<void> {
    this.#stopPolling();
    await this.detectTokens();
    this.#intervalId = setInterval(() => {
      this.detectTokens();
    }, this.getIntervalLength());
  }

  #getCorrectChainId(networkClientId?: NetworkClientId) {
    if (networkClientId) {
      const {
        configuration: { chainId },
      } = this.messagingSystem.call(
        'NetworkController:getNetworkClientById',
        networkClientId,
      );
      this.#chainId = chainId;
    }
    return this.#chainId;
  }

  async _executePoll(
    networkClientId: string,
    options: { address: string },
  ): Promise<void> {
    return await this.detectTokens({
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
  }): Promise<void> {
    const { networkClientId, accountAddress } = options ?? {};
    if (
      this.#disabled ||
      !this.#isDetectionEnabledForNetwork ||
      !this.#isDetectionEnabledFromPreferences
    ) {
      return;
    }
    const { tokens } = this.#getTokensState();
    const selectedAddress = accountAddress ?? this.#selectedAddress;
    const chainId = this.#getCorrectChainId(networkClientId);
    const tokensAddresses = tokens.map(
      /* istanbul ignore next*/ (token) => token.address.toLowerCase(),
    );
    const { tokenList } = await this.messagingSystem.call(
      'TokenListController:getState',
    );
    const tokensToDetect: string[] = [];
    for (const address of Object.keys(tokenList)) {
      if (!tokensAddresses.includes(address)) {
        tokensToDetect.push(address);
      }
    }
    const sliceOfTokensToDetect = [];
    for (let i = 0; i < tokensToDetect.length; i += 1000) {
      sliceOfTokensToDetect.push(
        tokensToDetect.slice(i, Math.min(i + 1000, tokensToDetect.length)),
      );
    }

    /* istanbul ignore else */
    if (!selectedAddress) {
      return;
    }

    for (const tokensSlice of sliceOfTokensToDetect) {
      if (tokensSlice.length === 0) {
        break;
      }

      await safelyExecute(async () => {
        const balances = await this.#getBalancesInSingleCall(
          selectedAddress,
          tokensSlice,
        );
        const tokensToAdd: Token[] = [];
        for (const tokenAddress of Object.keys(balances)) {
          let ignored;
          /* istanbul ignore else */
          const { ignoredTokens } = this.#getTokensState();
          if (ignoredTokens.length) {
            ignored = ignoredTokens.find(
              (ignoredTokenAddress) =>
                ignoredTokenAddress === toChecksumHexAddress(tokenAddress),
            );
          }
          const caseInsensitiveTokenKey =
            Object.keys(tokenList).find(
              (i) => i.toLowerCase() === tokenAddress.toLowerCase(),
            ) ?? '';

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
          await this.#addDetectedTokens(tokensToAdd, {
            selectedAddress,
            chainId,
          });
        }
      });
    }
  }
}

export default TokenDetectionController;
