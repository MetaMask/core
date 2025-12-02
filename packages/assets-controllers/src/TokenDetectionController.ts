import type {
  AccountsControllerGetSelectedAccountAction,
  AccountsControllerGetAccountAction,
  AccountsControllerSelectedEvmAccountChangeEvent,
} from '@metamask/accounts-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
} from '@metamask/base-controller';
import contractMap from '@metamask/contract-metadata';
import {
  ASSET_TYPES,
  ChainId,
  ERC20,
  safelyExecute,
  safelyExecuteWithTimeout,
  isEqualCaseInsensitive,
  toChecksumHexAddress,
  toHex,
} from '@metamask/controller-utils';
import type {
  KeyringControllerGetStateAction,
  KeyringControllerLockEvent,
  KeyringControllerUnlockEvent,
} from '@metamask/keyring-controller';
import type { Messenger } from '@metamask/messenger';
import type {
  NetworkClientId,
  NetworkControllerFindNetworkClientIdByChainIdAction,
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
import type { AuthenticationController } from '@metamask/profile-sync-controller';
import type { TransactionControllerTransactionConfirmedEvent } from '@metamask/transaction-controller';
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
  TokensControllerAddTokensAction,
  TokensControllerGetStateAction,
} from './TokensController';

const DEFAULT_INTERVAL = 180000;
const ACCOUNTS_API_TIMEOUT_MS = 10000;

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

type NetworkClient = {
  chainId: Hex;
  networkClientId: string;
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
 * Function that takes a TokensChainsCache object and maps chainId with TokenListMap.
 *
 * @param tokensChainsCache - TokensChainsCache input object
 * @returns returns the map of chainId with TokenListMap
 */
export function mapChainIdWithTokenListMap(
  tokensChainsCache: TokensChainsCache,
) {
  return mapValues(tokensChainsCache, (value) => {
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

export type TokenDetectionControllerAddDetectedTokensViaWsAction = {
  type: `TokenDetectionController:addDetectedTokensViaWs`;
  handler: TokenDetectionController['addDetectedTokensViaWs'];
};

export type TokenDetectionControllerActions =
  | TokenDetectionControllerGetStateAction
  | TokenDetectionControllerAddDetectedTokensViaWsAction;

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
  | TokensControllerAddDetectedTokensAction
  | TokensControllerAddTokensAction
  | NetworkControllerFindNetworkClientIdByChainIdAction
  | AuthenticationController.AuthenticationControllerGetBearerToken;

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
  | PreferencesControllerStateChangeEvent
  | TransactionControllerTransactionConfirmedEvent;

export type TokenDetectionControllerMessenger = Messenger<
  typeof controllerName,
  TokenDetectionControllerActions | AllowedActions,
  TokenDetectionControllerEvents | AllowedEvents
>;

/** The input to start polling for the {@link TokenDetectionController} */
type TokenDetectionPollingInput = {
  chainIds: Hex[];
  address: string;
};

/**
 * Controller that passively polls on a set interval for Tokens auto detection
 *
 * intervalId - Polling interval used to fetch new token rates
 *
 * selectedAddress - Vault selected address
 *
 * networkClientId - The network client ID of the current selected network
 *
 * disabled - Boolean to track if network requests are blocked
 *
 * isUnlocked - Boolean to track if the keyring state is unlocked
 *
 * isDetectionEnabledFromPreferences - Boolean to track if detection is enabled from PreferencesController
 *
 */
export class TokenDetectionController extends StaticIntervalPollingController<TokenDetectionPollingInput>()<
  typeof controllerName,
  TokenDetectionState,
  TokenDetectionControllerMessenger
> {
  #intervalId?: ReturnType<typeof setTimeout>;

  #selectedAccountId: string;

  #tokensChainsCache: TokensChainsCache = {};

  #disabled: boolean;

  #isUnlocked: boolean;

  #isDetectionEnabledFromPreferences: boolean;

  readonly #useTokenDetection: () => boolean;

  readonly #useExternalServices: () => boolean;

  readonly #getBalancesUsingMulticall: AssetsContractController['getBalancesUsingMulticall'];

  readonly #trackMetaMetricsEvent: (options: {
    event: string;
    category: string;
    properties: {
      tokens: string[];
      token_standard: string;
      asset_type: string;
    };
  }) => void;

  readonly #accountsAPI = {
    isAccountsAPIEnabled: true,
    supportedNetworksCache: null as number[] | null,
    platform: '' as 'extension' | 'mobile',

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

    async getMultiNetworksBalances(
      address: string,
      chainIds: Hex[],
      supportedNetworks: number[] | null,
      jwtToken?: string,
    ) {
      const chainIdNumbers = chainIds.map((chainId) => hexToNumber(chainId));

      if (
        !supportedNetworks ||
        !chainIdNumbers.every((id) => supportedNetworks.includes(id))
      ) {
        const supportedNetworksErrStr = (supportedNetworks ?? []).toString();
        throw new Error(
          `Unsupported Network: supported networks ${supportedNetworksErrStr}, requested networks: ${chainIdNumbers.toString()}`,
        );
      }

      const result = await fetchMultiChainBalances(
        address,
        {
          networks: chainIdNumbers,
        },
        this.platform,
        jwtToken,
      );

      // Return the full response including unprocessedNetworks
      return result;
    },
  };

  /**
   * Creates a TokenDetectionController instance.
   *
   * @param options - The controller options.
   * @param options.messenger - The controller messenger.
   * @param options.disabled - If set to true, all network requests are blocked.
   * @param options.interval - Polling interval used to fetch new token rates
   * @param options.getBalancesUsingMulticall - Gets the balances of a list of tokens using Multicall3 (supports 270+ chains).
   * @param options.trackMetaMetricsEvent - Sets options for MetaMetrics event tracking.
   * @param options.useAccountsAPI - Feature Switch for using the accounts API when detecting tokens (default: true)
   * @param options.useTokenDetection - Feature Switch for using token detection (default: true)
   * @param options.useExternalServices - Feature Switch for using external services (default: false)
   * @param options.platform - Indicates whether the platform is extension or mobile
   */
  constructor({
    interval = DEFAULT_INTERVAL,
    disabled = true,
    getBalancesUsingMulticall,
    trackMetaMetricsEvent,
    messenger,
    useAccountsAPI = true,
    useTokenDetection = () => true,
    useExternalServices = () => true,
    platform,
  }: {
    interval?: number;
    disabled?: boolean;
    getBalancesUsingMulticall: AssetsContractController['getBalancesUsingMulticall'];
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
    useAccountsAPI?: boolean;
    useTokenDetection?: () => boolean;
    useExternalServices?: () => boolean;
    platform: 'extension' | 'mobile';
  }) {
    super({
      name: controllerName,
      messenger,
      state: {},
      metadata: {},
    });

    this.messenger.registerActionHandler(
      `${controllerName}:addDetectedTokensViaWs` as const,
      this.addDetectedTokensViaWs.bind(this),
    );

    this.#disabled = disabled;
    this.setIntervalLength(interval);

    this.#selectedAccountId = this.#getSelectedAccount().id;

    const { tokensChainsCache } = this.messenger.call(
      'TokenListController:getState',
    );

    this.#tokensChainsCache = tokensChainsCache;

    const { useTokenDetection: defaultUseTokenDetection } = this.messenger.call(
      'PreferencesController:getState',
    );
    this.#isDetectionEnabledFromPreferences = defaultUseTokenDetection;

    this.#getBalancesUsingMulticall = getBalancesUsingMulticall;

    this.#trackMetaMetricsEvent = trackMetaMetricsEvent;

    const { isUnlocked } = this.messenger.call('KeyringController:getState');
    this.#isUnlocked = isUnlocked;

    this.#accountsAPI.isAccountsAPIEnabled = useAccountsAPI;
    this.#useTokenDetection = useTokenDetection;
    this.#useExternalServices = useExternalServices;
    this.#accountsAPI.platform = platform;

    this.#registerEventListeners();
  }

  /**
   * Constructor helper for registering this controller's messenger subscriptions to controller events.
   */
  #registerEventListeners() {
    this.messenger.subscribe('KeyringController:unlock', async () => {
      this.#isUnlocked = true;
      await this.#restartTokenDetection();
    });

    this.messenger.subscribe('KeyringController:lock', () => {
      this.#isUnlocked = false;
      this.#stopPolling();
    });

    this.messenger.subscribe(
      'TokenListController:stateChange',
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

    this.messenger.subscribe(
      'PreferencesController:stateChange',
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

    this.messenger.subscribe(
      'AccountsController:selectedEvmAccountChange',
      async (selectedAccount) => {
        const { networkConfigurationsByChainId } = this.messenger.call(
          'NetworkController:getState',
        );

        const chainIds = Object.keys(networkConfigurationsByChainId) as Hex[];
        const isSelectedAccountIdChanged =
          this.#selectedAccountId !== selectedAccount.id;
        if (isSelectedAccountIdChanged) {
          this.#selectedAccountId = selectedAccount.id;
          await this.#restartTokenDetection({
            selectedAddress: selectedAccount.address,
            chainIds,
          });
        }
      },
    );

    this.messenger.subscribe(
      'TransactionController:transactionConfirmed',
      async (transactionMeta) => {
        await this.detectTokens({
          chainIds: [transactionMeta.chainId],
        });
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
   *
   * @returns Whether the controller is active (not disabled and keyring is unlocked)
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
   *
   * @param tokensChainsCache - current tokensChainsCache input object
   * @param previousTokensChainsCache - previous tokensChainsCache input object
   * @returns boolean indicating if the two objects are equal
   */

  #compareTokensChainsCache(
    tokensChainsCache: TokensChainsCache,
    previousTokensChainsCache: TokensChainsCache,
  ): boolean {
    const cleanPreviousTokensChainsCache = mapChainIdWithTokenListMap(
      previousTokensChainsCache,
    );
    const cleanTokensChainsCache =
      mapChainIdWithTokenListMap(tokensChainsCache);
    const isEqualValues = isEqual(
      cleanTokensChainsCache,
      cleanPreviousTokensChainsCache,
    );
    return isEqualValues;
  }

  #getCorrectNetworkClientIdByChainId(
    chainIds: Hex[] | undefined,
  ): { chainId: Hex; networkClientId: NetworkClientId }[] {
    const { networkConfigurationsByChainId, selectedNetworkClientId } =
      this.messenger.call('NetworkController:getState');

    if (!chainIds) {
      const networkConfiguration = this.messenger.call(
        'NetworkController:getNetworkConfigurationByNetworkClientId',
        selectedNetworkClientId,
      );

      return [
        {
          chainId: networkConfiguration?.chainId ?? ChainId.mainnet,
          networkClientId: selectedNetworkClientId,
        },
      ];
    }

    return chainIds.map((chainId) => {
      const configuration = networkConfigurationsByChainId[chainId];
      return {
        chainId,
        networkClientId:
          configuration.rpcEndpoints[configuration.defaultRpcEndpointIndex]
            .networkClientId,
      };
    });
  }

  async _executePoll({
    chainIds,
    address,
  }: TokenDetectionPollingInput): Promise<void> {
    if (!this.isActive) {
      return;
    }
    await this.detectTokens({
      chainIds,
      selectedAddress: address,
    });
  }

  /**
   * Restart token detection polling period and call detectNewTokens
   * in case of address change or user session initialization.
   *
   * @param options - Options for restart token detection.
   * @param options.selectedAddress - the selectedAddress against which to detect for token balances
   * @param options.chainIds - The chain IDs of the network client to use.
   */
  async #restartTokenDetection({
    selectedAddress,
    chainIds,
  }: {
    selectedAddress?: string;
    chainIds?: Hex[];
  } = {}): Promise<void> {
    await this.detectTokens({
      chainIds,
      selectedAddress,
    });
    this.setIntervalLength(DEFAULT_INTERVAL);
  }

  #getChainsToDetect(
    clientNetworks: NetworkClient[],
    supportedNetworks: number[] | null | undefined,
  ) {
    const chainsToDetectUsingAccountAPI: Hex[] = [];
    const chainsToDetectUsingRpc: NetworkClient[] = [];

    clientNetworks.forEach(({ chainId, networkClientId }) => {
      if (supportedNetworks?.includes(hexToNumber(chainId))) {
        chainsToDetectUsingAccountAPI.push(chainId);
      } else {
        chainsToDetectUsingRpc.push({ chainId, networkClientId });
      }
    });

    return { chainsToDetectUsingRpc, chainsToDetectUsingAccountAPI };
  }

  async #attemptAccountAPIDetection(
    chainsToDetectUsingAccountAPI: Hex[],
    addressToDetect: string,
    supportedNetworks: number[] | null,
    jwtToken?: string,
  ) {
    const result = await safelyExecuteWithTimeout(
      async () => {
        return this.#addDetectedTokensViaAPI({
          chainIds: chainsToDetectUsingAccountAPI,
          selectedAddress: addressToDetect,
          supportedNetworks,
          jwtToken,
        });
      },
      false,
      ACCOUNTS_API_TIMEOUT_MS,
    );

    if (!result) {
      return { result: 'failed' } as const;
    }

    return result;
  }

  #addChainsToRpcDetection(
    chainsToDetectUsingRpc: NetworkClient[],
    chainsToDetectUsingAccountAPI: Hex[],
    clientNetworks: NetworkClient[],
  ): void {
    chainsToDetectUsingAccountAPI.forEach((chainId) => {
      const networkEntry = clientNetworks.find(
        (network) => network.chainId === chainId,
      );
      if (networkEntry) {
        chainsToDetectUsingRpc.push({
          chainId: networkEntry.chainId,
          networkClientId: networkEntry.networkClientId,
        });
      }
    });
  }

  #shouldDetectTokens(chainId: Hex): boolean {
    if (!isTokenDetectionSupportedForNetwork(chainId)) {
      return false;
    }
    if (
      !this.#isDetectionEnabledFromPreferences &&
      chainId !== ChainId.mainnet
    ) {
      return false;
    }

    const isMainnetDetectionInactive =
      !this.#isDetectionEnabledFromPreferences && chainId === ChainId.mainnet;
    if (isMainnetDetectionInactive) {
      this.#tokensChainsCache = this.#getConvertedStaticMainnetTokenList();
    } else {
      const { tokensChainsCache } = this.messenger.call(
        'TokenListController:getState',
      );
      this.#tokensChainsCache = tokensChainsCache ?? {};
    }

    return true;
  }

  async #detectTokensUsingRpc(
    chainsToDetectUsingRpc: NetworkClient[],
    addressToDetect: string,
  ): Promise<void> {
    for (const { chainId, networkClientId } of chainsToDetectUsingRpc) {
      if (!this.#shouldDetectTokens(chainId)) {
        continue;
      }

      const tokenCandidateSlices = this.#getSlicesOfTokensToDetect({
        chainId,
        selectedAddress: addressToDetect,
      });
      const tokenDetectionPromises = tokenCandidateSlices.map((tokensSlice) =>
        this.#addDetectedTokens({
          tokensSlice,
          selectedAddress: addressToDetect,
          networkClientId,
          chainId,
        }),
      );

      await Promise.all(tokenDetectionPromises);
    }
  }

  /**
   * For each token in the token list provided by the TokenListController, checks the token's balance for the selected account address on the active network.
   * On mainnet, if token detection is disabled in preferences, ERC20 token auto detection will be triggered for each contract address in the legacy token list from the @metamask/contract-metadata repo.
   *
   * @param options - Options for token detection.
   * @param options.chainIds - The chain IDs of the network client to use.
   * @param options.selectedAddress - the selectedAddress against which to detect for token balances.
   */
  async detectTokens({
    chainIds,
    selectedAddress,
  }: {
    chainIds?: Hex[];
    selectedAddress?: string;
  } = {}): Promise<void> {
    if (!this.isActive) {
      return;
    }

    if (!this.#useTokenDetection()) {
      return;
    }

    const addressToDetect = selectedAddress ?? this.#getSelectedAddress();
    const clientNetworks = this.#getCorrectNetworkClientIdByChainId(chainIds);

    const jwtToken = await safelyExecuteWithTimeout<string | undefined>(
      () => {
        return this.messenger.call('AuthenticationController:getBearerToken');
      },
      false,
      5000,
    );

    let supportedNetworks;
    if (this.#accountsAPI.isAccountsAPIEnabled && this.#useExternalServices()) {
      supportedNetworks = await this.#accountsAPI.getSupportedNetworks();
    }
    const { chainsToDetectUsingRpc, chainsToDetectUsingAccountAPI } =
      this.#getChainsToDetect(clientNetworks, supportedNetworks);

    // Try detecting tokens via Account API first if conditions allow
    if (supportedNetworks && chainsToDetectUsingAccountAPI.length > 0) {
      const apiResult = await this.#attemptAccountAPIDetection(
        chainsToDetectUsingAccountAPI,
        addressToDetect,
        supportedNetworks,
        jwtToken,
      );

      // If the account API call failed or returned undefined, have those chains fall back to RPC detection
      if (!apiResult || apiResult.result === 'failed') {
        this.#addChainsToRpcDetection(
          chainsToDetectUsingRpc,
          chainsToDetectUsingAccountAPI,
          clientNetworks,
        );
      } else if (
        apiResult?.result === 'success' &&
        apiResult.unprocessedNetworks &&
        apiResult.unprocessedNetworks.length > 0
      ) {
        // Handle unprocessed networks by adding them to RPC detection
        const unprocessedChainIds = apiResult.unprocessedNetworks.map(
          (chainId: number) => toHex(chainId),
        ) as Hex[];
        this.#addChainsToRpcDetection(
          chainsToDetectUsingRpc,
          unprocessedChainIds,
          clientNetworks,
        );
      }
    }

    // Proceed with RPC detection if there are chains remaining in chainsToDetectUsingRpc
    if (chainsToDetectUsingRpc.length > 0) {
      await this.#detectTokensUsingRpc(chainsToDetectUsingRpc, addressToDetect);
    }
  }

  #getSlicesOfTokensToDetect({
    chainId,
    selectedAddress,
  }: {
    chainId: Hex;
    selectedAddress: string;
  }): string[][] {
    const { allTokens, allDetectedTokens, allIgnoredTokens } =
      this.messenger.call('TokensController:getState');
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
   *
   * @param options - method arguments
   * @param options.selectedAddress - address to check against
   * @param options.chainIds - array of chainIds to check tokens for
   * @param options.supportedNetworks - array of chainIds to check tokens for
   * @param options.jwtToken - JWT token for authentication
   * @returns a success or failed object
   */
  async #addDetectedTokensViaAPI({
    selectedAddress,
    chainIds,
    supportedNetworks,
    jwtToken,
  }: {
    selectedAddress: string;
    chainIds: Hex[];
    supportedNetworks: number[] | null;
    jwtToken?: string;
  }) {
    return await safelyExecute(async () => {
      // Fetch balances for multiple chain IDs at once
      const apiResponse = await this.#accountsAPI
        .getMultiNetworksBalances(
          selectedAddress,
          chainIds,
          supportedNetworks,
          jwtToken,
        )
        .catch(() => null);

      if (apiResponse === null) {
        return { result: 'failed' } as const;
      }

      const tokenBalancesByChain = apiResponse.balances;

      // Process each chain ID individually
      for (const chainId of chainIds) {
        const isTokenDetectionInactiveInMainnet =
          !this.#isDetectionEnabledFromPreferences &&
          chainId === ChainId.mainnet;
        const { tokensChainsCache } = this.messenger.call(
          'TokenListController:getState',
        );
        this.#tokensChainsCache = isTokenDetectionInactiveInMainnet
          ? this.#getConvertedStaticMainnetTokenList()
          : (tokensChainsCache ?? {});

        // Generate token candidates based on chainId and selectedAddress
        const tokenCandidateSlices = this.#getSlicesOfTokensToDetect({
          chainId,
          selectedAddress,
        });

        // Filter balances for the current chainId
        const tokenBalances = tokenBalancesByChain.filter(
          (balance) => balance.chainId === hexToNumber(chainId),
        );

        if (!tokenBalances || tokenBalances.length === 0) {
          continue;
        }

        // Use helper function to filter tokens with balance for this chainId
        const { tokensWithBalance, eventTokensDetails } =
          this.#filterAndBuildTokensWithBalance(
            tokenCandidateSlices,
            tokenBalances,
            chainId,
          );

        if (tokensWithBalance.length) {
          this.#trackMetaMetricsEvent({
            event: 'Token Detected',
            category: 'Wallet',
            properties: {
              tokens: eventTokensDetails,
              token_standard: ERC20,
              asset_type: ASSET_TYPES.TOKEN,
            },
          });

          const networkClientId = this.messenger.call(
            'NetworkController:findNetworkClientIdByChainId',
            chainId,
          );

          await this.messenger.call(
            'TokensController:addTokens',
            tokensWithBalance,
            networkClientId,
          );
        }
      }

      return {
        result: 'success',
        unprocessedNetworks: apiResponse.unprocessedNetworks,
      } as const;
    });
  }

  /**
   * Helper function to filter and build token data for detected tokens
   *
   * @param options.tokenCandidateSlices - these are tokens we know a user does not have (by checking the tokens controller).
   * We will use these these token candidates to determine if a token found from the API is valid to be added on the users wallet.
   * It will also prevent us to adding tokens a user already has
   * @param tokenBalances - Tokens balances fetched from API
   * @param chainId - The chain ID being processed
   * @returns an object containing tokensWithBalance and eventTokensDetails arrays
   */

  #filterAndBuildTokensWithBalance(
    tokenCandidateSlices: string[][],
    tokenBalances:
      | {
          object: string;
          type?: string;
          timestamp?: string;
          address: string;
          symbol: string;
          name: string;
          decimals: number;
          chainId: number;
          balance: string;
        }[]
      | null,
    chainId: Hex,
  ) {
    const tokensWithBalance: Token[] = [];
    const eventTokensDetails: string[] = [];

    const tokenCandidateSet = new Set<string>(tokenCandidateSlices.flat());

    tokenBalances?.forEach((token) => {
      const tokenAddress = token.address;

      // Make sure the token to add is in our candidate list
      if (!tokenCandidateSet.has(tokenAddress)) {
        return;
      }

      // Retrieve token data from cache to safely add it
      const tokenData = this.#tokensChainsCache[chainId]?.data[tokenAddress];

      // We need specific data from tokensChainsCache to correctly create a token
      // So even if we have a token that was detected correctly by the API, if its missing data we cannot safely add it.
      if (!tokenData) {
        return;
      }

      const { decimals, symbol, aggregators, iconUrl, name } = tokenData;
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

    return { tokensWithBalance, eventTokensDetails };
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
      const balances = await this.#getBalancesUsingMulticall(
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
            token_standard: ERC20,
            asset_type: ASSET_TYPES.TOKEN,
          },
        });

        await this.messenger.call(
          'TokensController:addTokens',
          tokensWithBalance,
          networkClientId,
        );
      }
    });
  }

  /**
   * Add tokens detected from websocket balance updates
   * This method assumes:
   * - Tokens are already in the tokensChainsCache with full metadata
   * - Balance fetching is skipped since balances are provided by the websocket
   * - Ignored tokens have been filtered out by the caller
   *
   * @param options - The options object
   * @param options.tokensSlice - Array of token addresses detected from websocket (already filtered to exclude ignored tokens)
   * @param options.chainId - Hex chain ID
   * @returns Promise that resolves when tokens are added
   */
  async addDetectedTokensViaWs({
    tokensSlice,
    chainId,
  }: {
    tokensSlice: string[];
    chainId: Hex;
  }): Promise<void> {
    const tokensWithBalance: Token[] = [];
    const eventTokensDetails: string[] = [];

    for (const tokenAddress of tokensSlice) {
      // Normalize addresses explicitly (don't assume input format)
      const lowercaseTokenAddress = tokenAddress.toLowerCase();
      const checksummedTokenAddress = toChecksumHexAddress(tokenAddress);

      // Check map of validated tokens (cache keys are lowercase)
      const tokenData =
        this.#tokensChainsCache[chainId]?.data?.[lowercaseTokenAddress];

      if (!tokenData) {
        console.warn(
          `Token metadata not found in cache for ${tokenAddress} on chain ${chainId}`,
        );
        continue;
      }

      const { decimals, symbol, aggregators, iconUrl, name } = tokenData;

      // Push to lists with checksummed address (for allTokens storage)
      eventTokensDetails.push(`${symbol} - ${checksummedTokenAddress}`);
      tokensWithBalance.push({
        address: checksummedTokenAddress,
        decimals,
        symbol,
        aggregators,
        image: iconUrl,
        isERC721: false,
        name,
      });
    }

    // Perform addition
    if (tokensWithBalance.length) {
      this.#trackMetaMetricsEvent({
        event: 'Token Detected',
        category: 'Wallet',
        properties: {
          tokens: eventTokensDetails,
          token_standard: ERC20,
          asset_type: ASSET_TYPES.TOKEN,
        },
      });

      const networkClientId = this.messenger.call(
        'NetworkController:findNetworkClientIdByChainId',
        chainId,
      );

      await this.messenger.call(
        'TokensController:addTokens',
        tokensWithBalance,
        networkClientId,
      );
    }
  }

  #getSelectedAccount() {
    return this.messenger.call('AccountsController:getSelectedAccount');
  }

  #getSelectedAddress() {
    // If the address is not defined (or empty), we fallback to the currently selected account's address
    const account = this.messenger.call(
      'AccountsController:getAccount',
      this.#selectedAccountId,
    );
    return account?.address || '';
  }
}

export default TokenDetectionController;
