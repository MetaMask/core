import type { AccountsControllerSelectedAccountChangeEvent } from '@metamask/accounts-controller';
import type {
  RestrictedControllerMessenger,
  ControllerGetStateAction,
  ControllerStateChangeEvent,
} from '@metamask/base-controller';
import contractMap from '@metamask/contract-metadata';
import {
  ChainId,
  safelyExecute,
  toChecksumHexAddress,
} from '@metamask/controller-utils';
import type {
  KeyringControllerGetStateAction,
  KeyringControllerLockEvent,
  KeyringControllerUnlockEvent,
} from '@metamask/keyring-controller';
import type {
  NetworkClientId,
  NetworkControllerNetworkDidChangeEvent,
  NetworkControllerStateChangeEvent,
  NetworkControllerGetNetworkConfigurationByNetworkClientId,
} from '@metamask/network-controller';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import type { PreferencesState } from '@metamask/preferences-controller';
import type { Hex } from '@metamask/utils';

import type { AssetsContractController } from './AssetsContractController';
import { isTokenDetectionSupportedForNetwork } from './assetsUtil';
import type {
  GetTokenListState,
  TokenListStateChange,
  TokenListToken,
} from './TokenListController';
import type { Token } from './TokenRatesController';
import type { TokensController, TokensState } from './TokensController';

const DEFAULT_INTERVAL = 180000;

type LegacyToken = Omit<
  Token,
  'aggregators' | 'image' | 'balanceError' | 'isERC721'
> & {
  name: string;
  logo: string;
  erc20?: boolean;
  erc721?: boolean;
};

export const STATIC_MAINNET_TOKEN_LIST = Object.entries<LegacyToken>(
  contractMap,
).reduce<Record<string, Partial<TokenListToken>>>((acc, [base, contract]) => {
  const { logo, ...tokenMetadata } = contract;
  return {
    ...acc,
    [base.toLowerCase()]: {
      ...tokenMetadata,
      address: base.toLowerCase(),
      iconUrl: `images/contract/${logo}`,
      aggregators: [],
    },
  };
}, {});

export const controllerName = 'TokenDetectionController';

export type TokenDetectionState = Record<never, never>;

export type TokenDetectionControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  TokenDetectionState
>;

export type TokenDetectionControllerActions =
  TokenDetectionControllerGetStateAction;

export type AllowedActions =
  | NetworkControllerGetNetworkConfigurationByNetworkClientId
  | GetTokenListState
  | KeyringControllerGetStateAction;

export type TokenDetectionControllerStateChangeEvent =
  ControllerStateChangeEvent<typeof controllerName, TokenDetectionState>;

export type TokenDetectionControllerEvents =
  TokenDetectionControllerStateChangeEvent;

export type AllowedEvents =
  | AccountsControllerSelectedAccountChangeEvent
  | NetworkControllerStateChangeEvent
  | NetworkControllerNetworkDidChangeEvent
  | TokenListStateChange
  | KeyringControllerLockEvent
  | KeyringControllerUnlockEvent;

export type TokenDetectionControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  TokenDetectionControllerActions | AllowedActions,
  TokenDetectionControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

/**
 * Controller that passively polls on a set interval for Tokens auto detection
 * @property intervalId - Polling interval used to fetch new token rates
 * @property chainId - The chain ID of the current network
 * @property selectedAddress - Vault selected address
 * @property networkClientId - The network client ID of the current selected network
 * @property disabled - Boolean to track if network requests are blocked
 * @property isUnlocked - Boolean to track if the keyring state is unlocked
 * @property isDetectionEnabledFromPreferences - Boolean to track if detection is enabled from PreferencesController
 * @property isDetectionEnabledForNetwork - Boolean to track if detected is enabled for current network
 */
export class TokenDetectionController extends StaticIntervalPollingController<
  typeof controllerName,
  TokenDetectionState,
  TokenDetectionControllerMessenger
> {
  #intervalId?: ReturnType<typeof setTimeout>;

  #chainId: Hex;

  #selectedAddress: string;

  #networkClientId: NetworkClientId;

  #disabled: boolean;

  #isUnlocked: boolean;

  #isDetectionEnabledFromPreferences: boolean;

  #isDetectionEnabledForNetwork: boolean;

  readonly #onPreferencesStateChange: (
    listener: (preferencesState: PreferencesState) => Promise<void>,
  ) => void;

  readonly #addDetectedTokens: TokensController['addDetectedTokens'];

  readonly #getBalancesInSingleCall: AssetsContractController['getBalancesInSingleCall'];

  readonly #getTokensState: () => TokensState;

  readonly #trackMetaMetricsEvent: (options: {
    event: string;
    category: string;
    properties: {
      tokens: string[];
      token_standard: string;
      asset_type: string;
    };
  }) => void;

  /**
   * Creates a TokenDetectionController instance.
   *
   * @param options - The controller options.
   * @param options.messenger - The controller messaging system.
   * @param options.disabled - If set to true, all network requests are blocked.
   * @param options.interval - Polling interval used to fetch new token rates
   * @param options.networkClientId - The selected network client ID of the current network
   * @param options.selectedAddress - Vault selected address
   * @param options.getPreferencesState - Gets the state of the preferences controller.
   * @param options.onPreferencesStateChange - Allows subscribing to preferences controller state changes.
   * @param options.addDetectedTokens - Add a list of detected tokens.
   * @param options.getBalancesInSingleCall - Gets the balances of a list of tokens for the given address.
   * @param options.getTokensState - Gets the current state of the Tokens controller.
   * @param options.trackMetaMetricsEvent - Sets options for MetaMetrics event tracking.
   */
  constructor({
    networkClientId,
    selectedAddress = '',
    interval = DEFAULT_INTERVAL,
    disabled = true,
    onPreferencesStateChange,
    getBalancesInSingleCall,
    addDetectedTokens,
    getPreferencesState,
    getTokensState,
    trackMetaMetricsEvent,
    messenger,
  }: {
    networkClientId: NetworkClientId;
    selectedAddress?: string;
    interval?: number;
    disabled?: boolean;
    getPreferencesState: () => PreferencesState;
    onPreferencesStateChange: (
      listener: (preferencesState: PreferencesState) => Promise<void>,
    ) => void;
    addDetectedTokens: TokensController['addDetectedTokens'];
    getBalancesInSingleCall: AssetsContractController['getBalancesInSingleCall'];
    getTokensState: () => TokensState;
    trackMetaMetricsEvent: (options: {
      event: string;
      category: string;
      properties: {
        tokens: string[];
        token_standard: string;
        asset_type: string;
      };
    }) => void;
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

    this.#disabled = disabled;
    this.setIntervalLength(interval);

    this.#networkClientId = networkClientId;
    this.#selectedAddress = selectedAddress;
    this.#chainId = this.#getCorrectChainId(networkClientId);

    this.#isDetectionEnabledFromPreferences = defaultUseTokenDetection;
    this.#isDetectionEnabledForNetwork = isTokenDetectionSupportedForNetwork(
      this.#chainId,
    );

    this.#onPreferencesStateChange = onPreferencesStateChange;
    this.#addDetectedTokens = addDetectedTokens;
    this.#getBalancesInSingleCall = getBalancesInSingleCall;
    this.#getTokensState = getTokensState;

    this.#trackMetaMetricsEvent = trackMetaMetricsEvent;

    const { isUnlocked } = this.messagingSystem.call(
      'KeyringController:getState',
    );
    this.#isUnlocked = isUnlocked;

    this.#registerEventListeners();
  }

  /**
   * Constructor helper for registering this controller's messaging system subscriptions to controller events.
   */
  #registerEventListeners() {
    this.messagingSystem.subscribe('KeyringController:unlock', async () => {
      this.#isUnlocked = true;
      await this.#restartTokenDetection();
    });

    this.messagingSystem.subscribe('KeyringController:lock', () => {
      this.#isUnlocked = false;
    });

    this.messagingSystem.subscribe(
      'TokenListController:stateChange',
      async ({ tokenList }) => {
        const hasTokens = Object.keys(tokenList).length;

        if (hasTokens) {
          await this.#restartTokenDetection();
        }
      },
    );

    this.#onPreferencesStateChange(
      async ({ selectedAddress: newSelectedAddress, useTokenDetection }) => {
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
          await this.#restartTokenDetection({
            selectedAddress: this.#selectedAddress,
          });
        }
      },
    );

    this.messagingSystem.subscribe(
      'AccountsController:selectedAccountChange',
      async (account) => {
        if (
          this.#selectedAddress !== account.address &&
          this.#isDetectionEnabledFromPreferences
        ) {
          this.#selectedAddress = account.address;
          await this.#restartTokenDetection({
            selectedAddress: this.#selectedAddress,
          });
        }
      },
    );

    this.messagingSystem.subscribe(
      'NetworkController:networkDidChange',
      async ({ selectedNetworkClientId }) => {
        this.#networkClientId = selectedNetworkClientId;
        const newChainId = this.#getCorrectChainId(selectedNetworkClientId);
        const isChainIdChanged = this.#chainId !== newChainId;
        this.#chainId = newChainId;

        this.#isDetectionEnabledForNetwork =
          isTokenDetectionSupportedForNetwork(newChainId);

        if (this.#isDetectionEnabledForNetwork && isChainIdChanged) {
          await this.#restartTokenDetection({
            chainId: this.#chainId,
          });
        }
      },
    );
  }

  /**
   * Allows controller to make active and passive polling requests
   */
  enable() {
    this.#disabled = false;
  }

  /**
   * Blocks controller from making network calls
   */
  disable() {
    this.#disabled = true;
  }

  /**
   * Internal isActive state
   *
   * @type {object}
   */
  get isActive() {
    return !this.#disabled && this.#isUnlocked;
  }

  /**
   * Start polling for detected tokens.
   */
  async start() {
    this.enable();
    await this.#startPolling();
  }

  /**
   * Stop polling for detected tokens.
   */
  stop() {
    this.disable();
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
    if (!this.isActive) {
      return;
    }
    this.#stopPolling();
    await this.detectTokens();
    this.#intervalId = setInterval(async () => {
      await this.detectTokens();
    }, this.getIntervalLength());
  }

  #getCorrectChainId(networkClientId?: NetworkClientId) {
    const { chainId } =
      this.messagingSystem.call(
        'NetworkController:getNetworkConfigurationByNetworkClientId',
        networkClientId ?? this.#networkClientId,
      ) ?? {};
    return chainId ?? this.#chainId;
  }

  async _executePoll(
    networkClientId: string,
    options: { address: string },
  ): Promise<void> {
    if (!this.isActive) {
      return;
    }
    await this.detectTokens({
      networkClientId,
      accountAddress: options.address,
    });
  }

  /**
   * Restart token detection polling period and call detectNewTokens
   * in case of address change or user session initialization.
   *
   * @param options - Options for restart token detection.
   * @param options.selectedAddress - the selectedAddress against which to detect for token balances
   * @param options.chainId - the chainId against which to detect for token balances
   */
  async #restartTokenDetection({
    selectedAddress,
    chainId,
  }: Partial<{ selectedAddress: string; chainId: Hex }> = {}) {
    await this.detectTokens({
      accountAddress: selectedAddress,
      networkClientId: chainId,
    });
    this.setIntervalLength(DEFAULT_INTERVAL);
  }

  /**
   * For each token in the token list provided by the TokenListController, checks the token's balance for the selected account address on the active network.
   * On mainnet, if token detection is disabled in preferences, ERC20 token auto detection will be triggered for each contract address in the legacy token list from the @metamask/contract-metadata repo.
   *
   * @param options - Options for token detection.
   * @param options.networkClientId - The ID of the network client to use.
   * @param options.accountAddress - the selectedAddress against which to detect for token balances.
   */
  async detectTokens({
    networkClientId,
    accountAddress,
  }: {
    networkClientId?: NetworkClientId;
    accountAddress?: string;
  } = {}): Promise<void> {
    if (!this.isActive || !this.#isDetectionEnabledForNetwork) {
      return;
    }
    const selectedAddress = accountAddress ?? this.#selectedAddress;
    const chainId = this.#getCorrectChainId(networkClientId);

    if (
      !this.#isDetectionEnabledFromPreferences &&
      chainId !== ChainId.mainnet
    ) {
      return;
    }
    const isTokenDetectionInactiveInMainnet =
      !this.#isDetectionEnabledFromPreferences && chainId === ChainId.mainnet;
    const { tokenList } = this.messagingSystem.call(
      'TokenListController:getState',
    );
    const tokenListUsed = isTokenDetectionInactiveInMainnet
      ? STATIC_MAINNET_TOKEN_LIST
      : tokenList;

    const { tokens, detectedTokens } = this.#getTokensState();
    const tokensToDetect: string[] = [];

    const findCaseInsensitiveMatch = (source: string[], target: string) =>
      source.find((e: string) => e.toLowerCase() === target.toLowerCase());

    for (const tokenAddress of Object.keys(tokenListUsed)) {
      if (
        !findCaseInsensitiveMatch(
          tokens.map(({ address }) => address),
          tokenAddress,
        ) &&
        !findCaseInsensitiveMatch(
          detectedTokens.map(({ address }) => address),
          tokenAddress,
        )
      ) {
        tokensToDetect.push(tokenAddress);
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
        const balances = await this.#getBalancesInSingleCall(
          selectedAddress,
          tokensSlice,
        );
        const tokensToAdd: Token[] = [];
        const eventTokensDetails = [];
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
            findCaseInsensitiveMatch(
              Object.keys(tokenListUsed),
              tokenAddress,
            ) ?? '';

          if (ignored === undefined) {
            const { decimals, symbol, aggregators, iconUrl, name } =
              tokenList[caseInsensitiveTokenKey];
            eventTokensDetails.push(`${symbol} - ${tokenAddress}`);
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
          this.#trackMetaMetricsEvent({
            event: 'Token Detected',
            category: 'Wallet',
            properties: {
              tokens: eventTokensDetails,
              token_standard: 'ERC20',
              asset_type: 'TOKEN',
            },
          });
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
