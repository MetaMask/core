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
  isEqualCaseInsensitive,
  toChecksumHexAddress,
} from '@metamask/controller-utils';
import type {
  KeyringControllerGetStateAction,
  KeyringControllerLockEvent,
  KeyringControllerUnlockEvent,
} from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
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
import { isEqual, mapValues, isObject, get } from 'lodash';

import type { AssetsContractController } from './AssetsContractController';
import { isTokenDetectionSupportedForNetwork } from './assetsUtil';
import { SUPPORTED_NETWORKS_ACCOUNTS_API_V4 } from './constants';
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
): Record<string, unknown> {
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

export type TokenDetectionControllerAddDetectedTokensViaPollingAction = {
  type: `TokenDetectionController:addDetectedTokensViaPolling`;
  handler: TokenDetectionController['addDetectedTokensViaPolling'];
};

export type TokenDetectionControllerDetectTokensAction = {
  type: `TokenDetectionController:detectTokens`;
  handler: TokenDetectionController['detectTokens'];
};

export type TokenDetectionControllerActions =
  | TokenDetectionControllerGetStateAction
  | TokenDetectionControllerAddDetectedTokensViaWsAction
  | TokenDetectionControllerAddDetectedTokensViaPollingAction
  | TokenDetectionControllerDetectTokensAction;

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
  | AuthenticationController.AuthenticationControllerGetBearerTokenAction;

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

  readonly #getBalancesInSingleCall: AssetsContractController['getBalancesInSingleCall'];

  readonly #trackMetaMetricsEvent: (options: {
    event: string;
    category: string;
    properties: {
      tokens: string[];
      // eslint-disable-next-line @typescript-eslint/naming-convention
      token_standard: string;
      // eslint-disable-next-line @typescript-eslint/naming-convention
      asset_type: string;
    };
  }) => void;

  /**
   * Creates a TokenDetectionController instance.
   *
   * @param options - The controller options.
   * @param options.messenger - The controller messenger.
   * @param options.disabled - If set to true, all network requests are blocked.
   * @param options.interval - Polling interval used to fetch new token rates
   * @param options.getBalancesInSingleCall - Gets the balances of a list of tokens for the given address.
   * @param options.trackMetaMetricsEvent - Sets options for MetaMetrics event tracking.
   * @param options.useTokenDetection - Feature Switch for using token detection (default: true)
   * @param options.useExternalServices - Feature Switch for using external services (default: false)
   */
  constructor({
    interval = DEFAULT_INTERVAL,
    disabled = true,
    getBalancesInSingleCall,
    trackMetaMetricsEvent,
    messenger,
    useTokenDetection = (): boolean => true,
    useExternalServices = (): boolean => true,
  }: {
    interval?: number;
    disabled?: boolean;
    getBalancesInSingleCall: AssetsContractController['getBalancesInSingleCall'];
    trackMetaMetricsEvent: (options: {
      event: string;
      category: string;
      properties: {
        tokens: string[];
        // eslint-disable-next-line @typescript-eslint/naming-convention
        token_standard: string;
        // eslint-disable-next-line @typescript-eslint/naming-convention
        asset_type: string;
      };
    }) => void;
    messenger: TokenDetectionControllerMessenger;
    useTokenDetection?: () => boolean;
    useExternalServices?: () => boolean;
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

    this.messenger.registerActionHandler(
      `${controllerName}:addDetectedTokensViaPolling` as const,
      this.addDetectedTokensViaPolling.bind(this),
    );

    this.messenger.registerActionHandler(
      `${controllerName}:detectTokens` as const,
      this.detectTokens.bind(this),
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

    this.#getBalancesInSingleCall = getBalancesInSingleCall;

    this.#trackMetaMetricsEvent = trackMetaMetricsEvent;

    const { isUnlocked } = this.messenger.call('KeyringController:getState');
    this.#isUnlocked = isUnlocked;

    this.#useTokenDetection = useTokenDetection;
    this.#useExternalServices = useExternalServices;

    this.#registerEventListeners();
  }

  /**
   * Constructor helper for registering this controller's messenger subscriptions to controller events.
   */
  #registerEventListeners(): void {
    this.messenger.subscribe('KeyringController:unlock', () => {
      this.#isUnlocked = true;
      this.#restartTokenDetection().catch(() => {
        // Silently handle token detection errors
      });
    });

    this.messenger.subscribe('KeyringController:lock', () => {
      this.#isUnlocked = false;
      this.#stopPolling();
    });

    this.messenger.subscribe(
      'TokenListController:stateChange',
      ({ tokensChainsCache }) => {
        const isEqualValues = this.#compareTokensChainsCache(
          tokensChainsCache,
          this.#tokensChainsCache,
        );
        if (!isEqualValues) {
          this.#restartTokenDetection().catch(() => {
            // Silently handle token detection errors
          });
        }
      },
    );

    this.messenger.subscribe(
      'PreferencesController:stateChange',
      ({ useTokenDetection }) => {
        const selectedAccount = this.#getSelectedAccount();
        const isDetectionChangedFromPreferences =
          this.#isDetectionEnabledFromPreferences !== useTokenDetection;

        this.#isDetectionEnabledFromPreferences = useTokenDetection;

        if (isDetectionChangedFromPreferences) {
          this.#restartTokenDetection({
            selectedAddress: selectedAccount.address,
          }).catch(() => {
            // Silently handle token detection errors
          });
        }
      },
    );

    this.messenger.subscribe(
      'AccountsController:selectedEvmAccountChange',
      (selectedAccount) => {
        const { networkConfigurationsByChainId } = this.messenger.call(
          'NetworkController:getState',
        );

        const chainIds = Object.keys(networkConfigurationsByChainId) as Hex[];
        const isSelectedAccountIdChanged =
          this.#selectedAccountId !== selectedAccount.id;
        if (isSelectedAccountIdChanged) {
          this.#selectedAccountId = selectedAccount.id;
          this.#restartTokenDetection({
            selectedAddress: selectedAccount.address,
            chainIds,
          }).catch(() => {
            // Silently handle token detection errors
          });
        }
      },
    );

    this.messenger.subscribe(
      'TransactionController:transactionConfirmed',
      (transactionMeta) => {
        this.detectTokens({
          chainIds: [transactionMeta.chainId],
        }).catch(() => {
          // Silently handle token detection errors
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
    // Execute all chains in parallel for better performance
    const detectionPromises = chainsToDetectUsingRpc.map(
      async ({ chainId, networkClientId }) => {
        if (!this.#shouldDetectTokens(chainId)) {
          return;
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
      },
    );

    // Use allSettled to ensure one failing chain doesn't block others
    await Promise.allSettled(detectionPromises);
  }

  /**
   * For each token in the token list provided by the TokenListController, checks the token's balance for the selected account address on the active network.
   * On mainnet, if token detection is disabled in preferences, ERC20 token auto detection will be triggered for each contract address in the legacy token list from the @metamask/contract-metadata repo.
   *
   * @param options - Options for token detection.
   * @param options.chainIds - The chain IDs of the network client to use.
   * @param options.selectedAddress - the selectedAddress against which to detect for token balances.
   * @param options.forceRpc - Force RPC-based token detection for all specified chains,
   * bypassing external services check and ensuring RPC is used even for chains
   * that might otherwise be handled by the Accounts API.
   */
  async detectTokens({
    chainIds,
    selectedAddress,
    forceRpc = false,
  }: {
    chainIds?: Hex[];
    selectedAddress?: string;
    forceRpc?: boolean;
  } = {}): Promise<void> {
    if (!this.isActive) {
      return;
    }

    // When forceRpc is true, bypass the useTokenDetection check to ensure RPC detection runs
    if (!forceRpc && !this.#useTokenDetection()) {
      return;
    }

    // If external services are disabled and not forcing RPC, skip all detection
    if (!forceRpc && !this.#useExternalServices()) {
      return;
    }

    const addressToDetect = selectedAddress ?? this.#getSelectedAddress();
    const clientNetworks = this.#getCorrectNetworkClientIdByChainId(chainIds);

    // If forceRpc is true, use RPC for all chains
    // Otherwise, skip chains supported by Accounts API (they are handled by TokenBalancesController)
    const chainsToDetectUsingRpc = forceRpc
      ? clientNetworks
      : clientNetworks.filter(
          ({ chainId }) =>
            !SUPPORTED_NETWORKS_ACCOUNTS_API_V4.includes(chainId),
        );

    if (chainsToDetectUsingRpc.length === 0) {
      return;
    }

    await this.#detectTokensUsingRpc(chainsToDetectUsingRpc, addressToDetect);
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
        const { decimals, symbol, aggregators, iconUrl, name, rwaData } =
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
          ...(rwaData && { rwaData }),
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
   * This method:
   * - Checks if useTokenDetection preference is enabled (skips if disabled)
   * - Checks if external services are enabled (skips if disabled)
   * - Tokens are expected to be in the tokensChainsCache with full metadata
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
    // Check if token detection is enabled via preferences
    if (!this.#useTokenDetection()) {
      return;
    }

    // Check if external services are enabled (websocket requires external services)
    if (!this.#useExternalServices()) {
      return;
    }

    // Refresh the token cache to ensure we have the latest token metadata
    // This fixes a bug where the cache from construction time could be stale/empty
    const { tokensChainsCache } = this.messenger.call(
      'TokenListController:getState',
    );
    this.#tokensChainsCache = tokensChainsCache ?? {};

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

      const { decimals, symbol, aggregators, iconUrl, name, rwaData } =
        tokenData;

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
        ...(rwaData && { rwaData }),
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

  /**
   * Add tokens detected from polling balance updates
   * This method:
   * - Checks if useTokenDetection preference is enabled (skips if disabled)
   * - Checks if external services are enabled (skips if disabled)
   * - Filters out tokens already in allTokens or allIgnoredTokens
   * - Tokens are expected to be in the tokensChainsCache with full metadata
   * - Balance fetching is skipped since balances are provided by the caller
   *
   * @param options - The options object
   * @param options.tokensSlice - Array of token addresses detected from polling
   * @param options.chainId - Hex chain ID
   * @returns Promise that resolves when tokens are added
   */
  async addDetectedTokensViaPolling({
    tokensSlice,
    chainId,
  }: {
    tokensSlice: string[];
    chainId: Hex;
  }): Promise<void> {
    // Check if token detection is enabled via preferences
    if (!this.#useTokenDetection()) {
      return;
    }

    // Check if external services are enabled (polling via API requires external services)
    if (!this.#useExternalServices()) {
      return;
    }

    // Refresh the token cache to ensure we have the latest token metadata
    // This fixes a bug where the cache from construction time could be stale/empty
    const { tokensChainsCache } = this.messenger.call(
      'TokenListController:getState',
    );
    this.#tokensChainsCache = tokensChainsCache ?? {};

    const selectedAddress = this.#getSelectedAddress();

    // Get current token states to filter out already tracked/ignored tokens
    const { allTokens, allIgnoredTokens } = this.messenger.call(
      'TokensController:getState',
    );

    const existingTokenAddresses = (
      allTokens[chainId]?.[selectedAddress] ?? []
    ).map((token) => token.address.toLowerCase());

    const ignoredTokenAddresses = (
      allIgnoredTokens[chainId]?.[selectedAddress] ?? []
    ).map((address) => address.toLowerCase());

    const tokensWithBalance: Token[] = [];
    const eventTokensDetails: string[] = [];

    for (const tokenAddress of tokensSlice) {
      const lowercaseTokenAddress = tokenAddress.toLowerCase();
      const checksummedTokenAddress = toChecksumHexAddress(tokenAddress);

      // Skip tokens already in allTokens
      if (existingTokenAddresses.includes(lowercaseTokenAddress)) {
        continue;
      }

      // Skip tokens in allIgnoredTokens
      if (ignoredTokenAddresses.includes(lowercaseTokenAddress)) {
        continue;
      }

      // Check map of validated tokens (cache keys are lowercase)
      const tokenData =
        this.#tokensChainsCache[chainId]?.data?.[lowercaseTokenAddress];

      if (!tokenData) {
        console.warn(
          `Token metadata not found in cache for ${tokenAddress} on chain ${chainId}`,
        );
        continue;
      }

      const { decimals, symbol, aggregators, iconUrl, name, rwaData } =
        tokenData;

      eventTokensDetails.push(`${symbol} - ${checksummedTokenAddress}`);
      tokensWithBalance.push({
        address: checksummedTokenAddress,
        decimals,
        symbol,
        aggregators,
        image: iconUrl,
        isERC721: false,
        name,
        ...(rwaData && { rwaData }),
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

  #getSelectedAccount(): InternalAccount {
    return this.messenger.call('AccountsController:getSelectedAccount');
  }

  #getSelectedAddress(): string {
    // If the address is not defined (or empty), we fallback to the currently selected account's address
    const account = this.messenger.call(
      'AccountsController:getAccount',
      this.#selectedAccountId,
    );
    return account?.address ?? '';
  }
}

export default TokenDetectionController;
