import type {
  AccountsControllerGetSelectedAccountAction,
  AccountsControllerGetAccountAction,
  AccountsControllerSelectedEvmAccountChangeEvent,
} from '@metamask/accounts-controller';
import type {
  RestrictedControllerMessenger,
  ControllerGetStateAction,
  ControllerStateChangeEvent,
} from '@metamask/base-controller';
import contractMap from '@metamask/contract-metadata';
import {
  ASSET_TYPES,
  ChainId,
  ERC20,
  safelyExecute,
  isEqualCaseInsensitive,
} from '@metamask/controller-utils';
import type {
  KeyringControllerGetStateAction,
  KeyringControllerLockEvent,
  KeyringControllerUnlockEvent,
} from '@metamask/keyring-controller';
import type {
  NetworkClientId,
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerGetNetworkConfigurationByNetworkClientId,
  NetworkControllerGetStateAction,
  NetworkControllerNetworkDidChangeEvent,
} from '@metamask/network-controller';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import type {
  PreferencesControllerGetStateAction,
  PreferencesControllerStateChangeEvent,
} from '@metamask/preferences-controller';
import type { Hex } from '@metamask/utils';
import { hexToNumber } from '@metamask/utils';
import { isEqual, mapValues, isObject, get } from 'lodash';

import type { AssetsContractController } from './AssetsContractController';
import { isTokenDetectionSupportedForNetwork } from './assetsUtil';
import {
  fetchMultiChainBalances,
  fetchSupportedNetworks,
} from './multi-chain-accounts-service';
import type {
  GetTokenListState,
  TokenListMap,
  TokenListStateChange,
  TokensChainsCache,
} from './TokenListController';
import type { Token } from './TokenRatesController';
import type {
  TokensControllerAddDetectedTokensAction,
  TokensControllerGetStateAction,
} from './TokensController';

const DEFAULT_INTERVAL = 180000;

type LegacyToken = {
  name: string;
  logo: `${string}.svg`;
  symbol: string;
  decimals: number;
  erc20?: boolean;
  erc721?: boolean;
};

type TokenDetectionMap = {
  [P in keyof TokenListMap]: Omit<TokenListMap[P], 'occurrences'>;
};

export const STATIC_MAINNET_TOKEN_LIST = Object.entries<LegacyToken>(
  contractMap,
).reduce<TokenDetectionMap>((acc, [base, contract]) => {
  const { logo, erc20, erc721, ...tokenMetadata } = contract;
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

/**
 * Function that takes a TokensChainsCache object and returns it containing only the data field
 * @param obj - TokensChainsCache input object
 * @returns returns the object input with only the data field
 */
function retrieveDataFromTokensChainsCache(obj: TokensChainsCache) {
  return mapValues(obj, (value) => {
    if (isObject(value) && 'data' in value) {
      return get(value, ['data']);
    }
    return value;
  });
}

export const controllerName = 'TokenDetectionController';

export type TokenDetectionState = Record<never, never>;

export type TokenDetectionControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  TokenDetectionState
>;

export type TokenDetectionControllerActions =
  TokenDetectionControllerGetStateAction;

export type AllowedActions =
  | AccountsControllerGetSelectedAccountAction
  | AccountsControllerGetAccountAction
  | NetworkControllerGetNetworkClientByIdAction
  | NetworkControllerGetNetworkConfigurationByNetworkClientId
  | NetworkControllerGetStateAction
  | GetTokenListState
  | KeyringControllerGetStateAction
  | PreferencesControllerGetStateAction
  | TokensControllerGetStateAction
  | TokensControllerAddDetectedTokensAction;

export type TokenDetectionControllerStateChangeEvent =
  ControllerStateChangeEvent<typeof controllerName, TokenDetectionState>;

export type TokenDetectionControllerEvents =
  TokenDetectionControllerStateChangeEvent;

export type AllowedEvents =
  | AccountsControllerSelectedEvmAccountChangeEvent
  | NetworkControllerNetworkDidChangeEvent
  | TokenListStateChange
  | KeyringControllerLockEvent
  | KeyringControllerUnlockEvent
  | PreferencesControllerStateChangeEvent;

export type TokenDetectionControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  TokenDetectionControllerActions | AllowedActions,
  TokenDetectionControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

/** The input to start polling for the {@link TokenDetectionController} */
type TokenDetectionPollingInput = {
  networkClientId: NetworkClientId;
  address: string;
};

/**
 * Controller that passively polls on a set interval for Tokens auto detection
 * @property intervalId - Polling interval used to fetch new token rates
 * @property selectedAddress - Vault selected address
 * @property networkClientId - The network client ID of the current selected network
 * @property disabled - Boolean to track if network requests are blocked
 * @property isUnlocked - Boolean to track if the keyring state is unlocked
 * @property isDetectionEnabledFromPreferences - Boolean to track if detection is enabled from PreferencesController
 * @property isDetectionEnabledForNetwork - Boolean to track if detected is enabled for current network
 */
export class TokenDetectionController extends StaticIntervalPollingController<TokenDetectionPollingInput>()<
  typeof controllerName,
  TokenDetectionState,
  TokenDetectionControllerMessenger
> {
  #intervalId?: ReturnType<typeof setTimeout>;

  #selectedAccountId: string;

  #networkClientId: NetworkClientId;

  #tokensChainsCache: TokensChainsCache = {};

  #disabled: boolean;

  #isUnlocked: boolean;

  #isDetectionEnabledFromPreferences: boolean;

  #isDetectionEnabledForNetwork: boolean;

  readonly #getBalancesInSingleCall: AssetsContractController['getBalancesInSingleCall'];

  readonly #trackMetaMetricsEvent: (options: {
    event: string;
    category: string;
    properties: {
      tokens: string[];
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/naming-convention
      token_standard: string;
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/naming-convention
      asset_type: string;
    };
  }) => void;

  #accountsAPI = {
    isAccountsAPIEnabled: true,
    supportedNetworksCache: null as number[] | null,
    async getSupportedNetworks() {
      /* istanbul ignore next */
      if (!this.isAccountsAPIEnabled) {
        throw new Error('Accounts API Feature Switch is disabled');
      }

      /* istanbul ignore next */
      if (this.supportedNetworksCache) {
        return this.supportedNetworksCache;
      }

      const result = await fetchSupportedNetworks().catch(() => null);
      this.supportedNetworksCache = result;
      return result;
    },

    async getMultiChainBalances(address: string, chainId: Hex) {
      if (!this.isAccountsAPIEnabled) {
        throw new Error('Accounts API Feature Switch is disabled');
      }

      const chainIdNumber = hexToNumber(chainId);
      const supportedNetworks = await this.getSupportedNetworks();

      if (!supportedNetworks || !supportedNetworks.includes(chainIdNumber)) {
        const supportedNetworksErrStr = (supportedNetworks ?? []).toString();
        throw new Error(
          `Unsupported Network: supported networks ${supportedNetworksErrStr}, network: ${chainIdNumber}`,
        );
      }

      const result = await fetchMultiChainBalances(address, {
        networks: [chainIdNumber],
      });

      return result.balances;
    },
  };

  /**
   * Creates a TokenDetectionController instance.
   *
   * @param options - The controller options.
   * @param options.messenger - The controller messaging system.
   * @param options.disabled - If set to true, all network requests are blocked.
   * @param options.interval - Polling interval used to fetch new token rates
   * @param options.getBalancesInSingleCall - Gets the balances of a list of tokens for the given address.
   * @param options.trackMetaMetricsEvent - Sets options for MetaMetrics event tracking.
   * @param options.useAccountsAPI - Feature Switch for using the accounts API when detecting tokens (default: true)
   */
  constructor({
    interval = DEFAULT_INTERVAL,
    disabled = true,
    getBalancesInSingleCall,
    trackMetaMetricsEvent,
    messenger,
    useAccountsAPI = true,
  }: {
    interval?: number;
    disabled?: boolean;
    getBalancesInSingleCall: AssetsContractController['getBalancesInSingleCall'];
    trackMetaMetricsEvent: (options: {
      event: string;
      category: string;
      properties: {
        tokens: string[];
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/naming-convention
        token_standard: string;
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/naming-convention
        asset_type: string;
      };
    }) => void;
    messenger: TokenDetectionControllerMessenger;
    useAccountsAPI?: boolean;
  }) {
    super({
      name: controllerName,
      messenger,
      state: {},
      metadata: {},
    });

    this.#disabled = disabled;
    this.setIntervalLength(interval);

    this.#selectedAccountId = this.#getSelectedAccount().id;

    const { chainId, networkClientId } =
      this.#getCorrectChainIdAndNetworkClientId();
    this.#networkClientId = networkClientId;

    const { tokensChainsCache } = this.messagingSystem.call(
      'TokenListController:getState',
    );
    this.#tokensChainsCache = tokensChainsCache;

    const { useTokenDetection: defaultUseTokenDetection } =
      this.messagingSystem.call('PreferencesController:getState');
    this.#isDetectionEnabledFromPreferences = defaultUseTokenDetection;
    this.#isDetectionEnabledForNetwork =
      isTokenDetectionSupportedForNetwork(chainId);

    this.#getBalancesInSingleCall = getBalancesInSingleCall;

    this.#trackMetaMetricsEvent = trackMetaMetricsEvent;

    const { isUnlocked } = this.messagingSystem.call(
      'KeyringController:getState',
    );
    this.#isUnlocked = isUnlocked;

    this.#accountsAPI.isAccountsAPIEnabled = useAccountsAPI;

    this.#registerEventListeners();
  }

  /**
   * Constructor helper for registering this controller's messaging system subscriptions to controller events.
   */
  #registerEventListeners() {
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    this.messagingSystem.subscribe('KeyringController:unlock', async () => {
      this.#isUnlocked = true;
      await this.#restartTokenDetection();
    });

    this.messagingSystem.subscribe('KeyringController:lock', () => {
      this.#isUnlocked = false;
      this.#stopPolling();
    });

    this.messagingSystem.subscribe(
      'TokenListController:stateChange',
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      async ({ tokensChainsCache }) => {
        const isEqualValues = this.#compareTokensChainsCache(
          tokensChainsCache,
          this.#tokensChainsCache,
        );
        if (!isEqualValues) {
          await this.#restartTokenDetection();
        }
      },
    );

    this.messagingSystem.subscribe(
      'PreferencesController:stateChange',
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      async ({ useTokenDetection }) => {
        const selectedAccount = this.#getSelectedAccount();
        const isDetectionChangedFromPreferences =
          this.#isDetectionEnabledFromPreferences !== useTokenDetection;

        this.#isDetectionEnabledFromPreferences = useTokenDetection;

        if (isDetectionChangedFromPreferences) {
          await this.#restartTokenDetection({
            selectedAddress: selectedAccount.address,
          });
        }
      },
    );

    this.messagingSystem.subscribe(
      'AccountsController:selectedEvmAccountChange',
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      async (selectedAccount) => {
        const isSelectedAccountIdChanged =
          this.#selectedAccountId !== selectedAccount.id;
        if (isSelectedAccountIdChanged) {
          this.#selectedAccountId = selectedAccount.id;
          await this.#restartTokenDetection({
            selectedAddress: selectedAccount.address,
          });
        }
      },
    );

    this.messagingSystem.subscribe(
      'NetworkController:networkDidChange',
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      async ({ selectedNetworkClientId }) => {
        const isNetworkClientIdChanged =
          this.#networkClientId !== selectedNetworkClientId;

        const { chainId: newChainId } =
          this.#getCorrectChainIdAndNetworkClientId(selectedNetworkClientId);
        this.#isDetectionEnabledForNetwork =
          isTokenDetectionSupportedForNetwork(newChainId);

        if (isNetworkClientIdChanged && this.#isDetectionEnabledForNetwork) {
          this.#networkClientId = selectedNetworkClientId;
          await this.#restartTokenDetection({
            networkClientId: this.#networkClientId,
          });
        }
      },
    );
  }

  /**
   * Allows controller to make active and passive polling requests
   */
  enable(): void {
    this.#disabled = false;
  }

  /**
   * Blocks controller from making network calls
   */
  disable(): void {
    this.#disabled = true;
  }

  /**
   * Internal isActive state
   * @type {boolean}
   */
  get isActive(): boolean {
    return !this.#disabled && this.#isUnlocked;
  }

  /**
   * Start polling for detected tokens.
   */
  async start(): Promise<void> {
    this.enable();
    await this.#startPolling();
  }

  /**
   * Stop polling for detected tokens.
   */
  stop(): void {
    this.disable();
    this.#stopPolling();
  }

  #stopPolling(): void {
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
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    this.#intervalId = setInterval(async () => {
      await this.detectTokens();
    }, this.getIntervalLength());
  }

  /**
   * Compares current and previous tokensChainsCache object focusing only on the data object.
   * @param tokensChainsCache - current tokensChainsCache input object
   * @param previousTokensChainsCache - previous tokensChainsCache input object
   * @returns boolean indicating if the two objects are equal
   */

  #compareTokensChainsCache(
    tokensChainsCache: TokensChainsCache,
    previousTokensChainsCache: TokensChainsCache,
  ): boolean {
    const cleanPreviousTokensChainsCache = retrieveDataFromTokensChainsCache(
      previousTokensChainsCache,
    );
    const cleanTokensChainsCache =
      retrieveDataFromTokensChainsCache(tokensChainsCache);
    const isEqualValues = isEqual(
      cleanTokensChainsCache,
      cleanPreviousTokensChainsCache,
    );
    return isEqualValues;
  }

  #getCorrectChainIdAndNetworkClientId(networkClientId?: NetworkClientId): {
    chainId: Hex;
    networkClientId: NetworkClientId;
  } {
    if (networkClientId) {
      const networkConfiguration = this.messagingSystem.call(
        'NetworkController:getNetworkConfigurationByNetworkClientId',
        networkClientId,
      );
      if (networkConfiguration) {
        return {
          chainId: networkConfiguration.chainId,
          networkClientId,
        };
      }
    }
    const { selectedNetworkClientId } = this.messagingSystem.call(
      'NetworkController:getState',
    );
    const {
      configuration: { chainId },
    } = this.messagingSystem.call(
      'NetworkController:getNetworkClientById',
      selectedNetworkClientId,
    );
    return {
      chainId,
      networkClientId: selectedNetworkClientId,
    };
  }

  async _executePoll({
    networkClientId,
    address,
  }: TokenDetectionPollingInput): Promise<void> {
    if (!this.isActive) {
      return;
    }
    await this.detectTokens({
      networkClientId,
      selectedAddress: address,
    });
  }

  /**
   * Restart token detection polling period and call detectNewTokens
   * in case of address change or user session initialization.
   *
   * @param options - Options for restart token detection.
   * @param options.selectedAddress - the selectedAddress against which to detect for token balances
   * @param options.networkClientId - The ID of the network client to use.
   */
  async #restartTokenDetection({
    selectedAddress,
    networkClientId,
  }: {
    selectedAddress?: string;
    networkClientId?: NetworkClientId;
  } = {}): Promise<void> {
    await this.detectTokens({
      networkClientId,
      selectedAddress,
    });
    this.setIntervalLength(DEFAULT_INTERVAL);
  }

  /**
   * For each token in the token list provided by the TokenListController, checks the token's balance for the selected account address on the active network.
   * On mainnet, if token detection is disabled in preferences, ERC20 token auto detection will be triggered for each contract address in the legacy token list from the @metamask/contract-metadata repo.
   *
   * @param options - Options for token detection.
   * @param options.networkClientId - The ID of the network client to use.
   * @param options.selectedAddress - the selectedAddress against which to detect for token balances.
   */
  async detectTokens({
    networkClientId,
    selectedAddress,
  }: {
    networkClientId?: NetworkClientId;
    selectedAddress?: string;
  } = {}): Promise<void> {
    if (!this.isActive) {
      return;
    }

    const addressAgainstWhichToDetect =
      selectedAddress ?? this.#getSelectedAddress();
    const { chainId, networkClientId: selectedNetworkClientId } =
      this.#getCorrectChainIdAndNetworkClientId(networkClientId);
    const chainIdAgainstWhichToDetect = chainId;
    const networkClientIdAgainstWhichToDetect = selectedNetworkClientId;

    if (!isTokenDetectionSupportedForNetwork(chainIdAgainstWhichToDetect)) {
      return;
    }
    if (
      !this.#isDetectionEnabledFromPreferences &&
      chainIdAgainstWhichToDetect !== ChainId.mainnet
    ) {
      return;
    }
    const isTokenDetectionInactiveInMainnet =
      !this.#isDetectionEnabledFromPreferences &&
      chainIdAgainstWhichToDetect === ChainId.mainnet;
    const { tokensChainsCache } = this.messagingSystem.call(
      'TokenListController:getState',
    );
    this.#tokensChainsCache = isTokenDetectionInactiveInMainnet
      ? this.#getConvertedStaticMainnetTokenList()
      : tokensChainsCache ?? {};

    const tokenCandidateSlices = this.#getSlicesOfTokensToDetect({
      chainId: chainIdAgainstWhichToDetect,
      selectedAddress: addressAgainstWhichToDetect,
    });

    // Attempt Accounts API Detection
    const accountAPIResult = await this.#addDetectedTokensViaAPI({
      chainId: chainIdAgainstWhichToDetect,
      selectedAddress: addressAgainstWhichToDetect,
      tokenCandidateSlices,
    });
    if (accountAPIResult?.result === 'success') {
      return;
    }

    // Attempt RPC Detection
    const tokenDetectionPromises = tokenCandidateSlices.map((tokensSlice) =>
      this.#addDetectedTokens({
        tokensSlice,
        selectedAddress: addressAgainstWhichToDetect,
        networkClientId: networkClientIdAgainstWhichToDetect,
        chainId: chainIdAgainstWhichToDetect,
      }),
    );

    await Promise.all(tokenDetectionPromises);
  }

  #getSlicesOfTokensToDetect({
    chainId,
    selectedAddress,
  }: {
    chainId: Hex;
    selectedAddress: string;
  }): string[][] {
    const { allTokens, allDetectedTokens, allIgnoredTokens } =
      this.messagingSystem.call('TokensController:getState');
    const [tokensAddresses, detectedTokensAddresses, ignoredTokensAddresses] = [
      allTokens,
      allDetectedTokens,
      allIgnoredTokens,
    ].map((tokens) =>
      (tokens[chainId]?.[selectedAddress] ?? []).map((value) =>
        typeof value === 'string' ? value : value.address,
      ),
    );

    const tokensToDetect: string[] = [];
    for (const tokenAddress of Object.keys(
      this.#tokensChainsCache?.[chainId]?.data || {},
    )) {
      if (
        [
          tokensAddresses,
          detectedTokensAddresses,
          ignoredTokensAddresses,
        ].every(
          (addresses) =>
            !addresses.find((address) =>
              isEqualCaseInsensitive(address, tokenAddress),
            ),
        )
      ) {
        tokensToDetect.push(tokenAddress);
      }
    }

    const slicesOfTokensToDetect = [];
    for (let i = 0, size = 1000; i < tokensToDetect.length; i += size) {
      slicesOfTokensToDetect.push(tokensToDetect.slice(i, i + size));
    }

    return slicesOfTokensToDetect;
  }

  #getConvertedStaticMainnetTokenList(): TokensChainsCache {
    const data: TokenListMap = Object.entries(STATIC_MAINNET_TOKEN_LIST).reduce(
      (acc, [key, value]) => ({
        ...acc,
        [key]: {
          name: value.name,
          symbol: value.symbol,
          decimals: value.decimals,
          address: value.address,
          aggregators: [],
          iconUrl: value?.iconUrl,
        },
      }),
      {},
    );
    return {
      '0x1': {
        data,
        timestamp: 0,
      },
    };
  }

  /**
   * This adds detected tokens from the Accounts API, avoiding the multi-call RPC calls for balances
   * @param options - method arguments
   * @param options.selectedAddress - address to check against
   * @param options.chainId - chainId to check tokens for
   * @param options.tokenCandidateSlices - these are tokens we know a user does not have (by checking the tokens controller).
   * We will use these these token candidates to determine if a token found from the API is valid to be added on the users wallet.
   * It will also prevent us to adding tokens a user already has
   * @returns a success or failed object
   */
  async #addDetectedTokensViaAPI({
    selectedAddress,
    chainId,
    tokenCandidateSlices,
  }: {
    selectedAddress: string;
    chainId: Hex;
    tokenCandidateSlices: string[][];
  }) {
    return await safelyExecute(async () => {
      const tokenBalances = await this.#accountsAPI
        .getMultiChainBalances(selectedAddress, chainId)
        .catch(() => null);

      if (!tokenBalances || tokenBalances.length === 0) {
        return { result: 'failed' } as const;
      }

      const tokensWithBalance: Token[] = [];
      const eventTokensDetails: string[] = [];

      const tokenCandidateSet = new Set<string>(tokenCandidateSlices.flat());

      tokenBalances.forEach((token) => {
        const tokenAddress = token.address;

        // Make sure that the token to add is in our candidate list
        // Ensures we don't add tokens we already own
        if (!tokenCandidateSet.has(token.address)) {
          return;
        }

        // We need specific data from tokensChainsCache to correctly create a token
        // So even if we have a token that was detected correctly by the API, if its missing data we cannot safely add it.
        if (!this.#tokensChainsCache[chainId].data[token.address]) {
          return;
        }

        const { decimals, symbol, aggregators, iconUrl, name } =
          this.#tokensChainsCache[chainId].data[token.address];
        eventTokensDetails.push(`${symbol} - ${tokenAddress}`);
        tokensWithBalance.push({
          address: tokenAddress,
          decimals,
          symbol,
          aggregators,
          image: iconUrl,
          isERC721: false,
          name,
        });
      });

      if (tokensWithBalance.length) {
        this.#trackMetaMetricsEvent({
          event: 'Token Detected',
          category: 'Wallet',
          properties: {
            tokens: eventTokensDetails,
            // TODO: Either fix this lint violation or explain why it's necessary to ignore.
            // eslint-disable-next-line @typescript-eslint/naming-convention
            token_standard: ERC20,
            // TODO: Either fix this lint violation or explain why it's necessary to ignore.
            // eslint-disable-next-line @typescript-eslint/naming-convention
            asset_type: ASSET_TYPES.TOKEN,
          },
        });

        await this.messagingSystem.call(
          'TokensController:addDetectedTokens',
          tokensWithBalance,
          {
            selectedAddress,
            chainId,
          },
        );
      }

      return { result: 'success' } as const;
    });
  }

  async #addDetectedTokens({
    tokensSlice,
    selectedAddress,
    networkClientId,
    chainId,
  }: {
    tokensSlice: string[];
    selectedAddress: string;
    networkClientId: NetworkClientId;
    chainId: Hex;
  }): Promise<void> {
    await safelyExecute(async () => {
      const balances = await this.#getBalancesInSingleCall(
        selectedAddress,
        tokensSlice,
        networkClientId,
      );

      const tokensWithBalance: Token[] = [];
      const eventTokensDetails: string[] = [];
      for (const nonZeroTokenAddress of Object.keys(balances)) {
        const { decimals, symbol, aggregators, iconUrl, name } =
          this.#tokensChainsCache[chainId].data[nonZeroTokenAddress];
        eventTokensDetails.push(`${symbol} - ${nonZeroTokenAddress}`);
        tokensWithBalance.push({
          address: nonZeroTokenAddress,
          decimals,
          symbol,
          aggregators,
          image: iconUrl,
          isERC721: false,
          name,
        });
      }

      if (tokensWithBalance.length) {
        this.#trackMetaMetricsEvent({
          event: 'Token Detected',
          category: 'Wallet',
          properties: {
            tokens: eventTokensDetails,
            // TODO: Either fix this lint violation or explain why it's necessary to ignore.
            // eslint-disable-next-line @typescript-eslint/naming-convention
            token_standard: ERC20,
            // TODO: Either fix this lint violation or explain why it's necessary to ignore.
            // eslint-disable-next-line @typescript-eslint/naming-convention
            asset_type: ASSET_TYPES.TOKEN,
          },
        });

        await this.messagingSystem.call(
          'TokensController:addDetectedTokens',
          tokensWithBalance,
          {
            selectedAddress,
            chainId,
          },
        );
      }
    });
  }

  #getSelectedAccount() {
    return this.messagingSystem.call('AccountsController:getSelectedAccount');
  }

  #getSelectedAddress() {
    // If the address is not defined (or empty), we fallback to the currently selected account's address
    const account = this.messagingSystem.call(
      'AccountsController:getAccount',
      this.#selectedAccountId,
    );
    return account?.address || '';
  }
}

export default TokenDetectionController;
