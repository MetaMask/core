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
import type { Hex } from '@metamask/utils';
import { mapValues, isObject, get } from 'lodash';

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
 * @returns The map of chainId with TokenListMap.
 */
export function mapChainIdWithTokenListMap(
  tokensChainsCache: TokensChainsCache,
): Record<string, TokenListMap | unknown> {
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
  | NetworkControllerFindNetworkClientIdByChainIdAction;

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

  readonly #useAccountsAPI: boolean;

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
   * @param options.useExternalServices - Feature Switch for using external services like RPC autodetection (default: true)
   * @param options.useAccountsAPI - If true, supported chains use Account API via TokenBalancesController. If false, use RPC for all chains. (default: true)
   */
  constructor({
    interval = DEFAULT_INTERVAL,
    disabled = true,
    getBalancesInSingleCall,
    trackMetaMetricsEvent,
    messenger,
    useTokenDetection = (): boolean => true,
    useExternalServices = (): boolean => true,
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
        // eslint-disable-next-line @typescript-eslint/naming-convention
        token_standard: string;
        // eslint-disable-next-line @typescript-eslint/naming-convention
        asset_type: string;
      };
    }) => void;
    messenger: TokenDetectionControllerMessenger;
    useTokenDetection?: () => boolean;
    useExternalServices?: () => boolean;
    useAccountsAPI?: boolean;
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

    this.#getBalancesInSingleCall = getBalancesInSingleCall;

    this.#trackMetaMetricsEvent = trackMetaMetricsEvent;

    const { isUnlocked } = this.messenger.call('KeyringController:getState');
    this.#isUnlocked = isUnlocked;

    this.#useTokenDetection = useTokenDetection;
    this.#useExternalServices = useExternalServices;
    this.#useAccountsAPI = useAccountsAPI;

    this.#registerEventListeners();
  }

  /**
   * Constructor helper for registering this controller's messenger subscriptions to controller events.
   */
  #registerEventListeners(): void {
    this.messenger.subscribe('KeyringController:unlock', () => {
      this.#isUnlocked = true;
    });

    this.messenger.subscribe('KeyringController:lock', () => {
      this.#isUnlocked = false;
      this.#stopPolling();
    });

    this.messenger.subscribe(
      'TokenListController:stateChange',
      ({ tokensChainsCache }) => {
        const previousCache = this.#tokensChainsCache;
        this.#tokensChainsCache = tokensChainsCache;

        // Trigger detection if the cache data changed (not just timestamp)
        if (this.isActive && this.#hasTokenListChanged(previousCache)) {
          this.detectTokens().catch(() => {
            // Silently handle detection errors on token list change
          });
        }
      },
    );

    this.messenger.subscribe(
      'PreferencesController:stateChange',
      ({ useTokenDetection }) => {
        const wasEnabled = this.#isDetectionEnabledFromPreferences;
        this.#isDetectionEnabledFromPreferences = useTokenDetection;

        // Trigger detection if token detection was just enabled
        if (!wasEnabled && useTokenDetection && this.isActive) {
          this.detectTokens().catch(() => {
            // Silently handle detection errors on preference change
          });
        }
      },
    );

    this.messenger.subscribe(
      'AccountsController:selectedEvmAccountChange',
      (selectedAccount) => {
        const previousAccountId = this.#selectedAccountId;
        this.#selectedAccountId = selectedAccount.id;

        // Trigger detection if account changed and controller is active
        if (previousAccountId !== selectedAccount.id && this.isActive) {
          this.detectTokens().catch(() => {
            // Silently handle detection errors on account change
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

  /**
   * Compares the current tokensChainsCache with a previous version to determine
   * if the token list data has changed (ignoring timestamp changes).
   *
   * @param previousCache - The previous tokensChainsCache to compare against.
   * @returns True if the token list data has changed, false otherwise.
   */
  #hasTokenListChanged(previousCache: TokensChainsCache): boolean {
    const currentCache = this.#tokensChainsCache;
    if (!previousCache || !currentCache) {
      return previousCache !== currentCache;
    }

    const previousChainIds = Object.keys(previousCache) as Hex[];
    const currentChainIds = Object.keys(currentCache) as Hex[];

    // Check if chain IDs are different
    if (previousChainIds.length !== currentChainIds.length) {
      return true;
    }

    // Check if any chain's data has changed (ignore timestamp)
    for (const chainId of currentChainIds) {
      const previousData = previousCache[chainId]?.data;
      const currentData = currentCache[chainId]?.data;

      if (!previousData && currentData) {
        return true;
      }
      if (previousData && !currentData) {
        return true;
      }
      if (previousData && currentData) {
        const previousAddresses = Object.keys(previousData);
        const currentAddresses = Object.keys(currentData);
        if (previousAddresses.length !== currentAddresses.length) {
          return true;
        }
        for (const address of currentAddresses) {
          if (!previousData[address]) {
            return true;
          }
        }
      }
    }

    return false;
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

  #shouldDetectTokens(chainId: Hex): boolean {
    // Skip detection for chains supported by Accounts API v4
    if (SUPPORTED_NETWORKS_ACCOUNTS_API_V4.includes(chainId)) {
      return false;
    }

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

    // If external services are disabled, skip all detection
    if (!this.#useExternalServices()) {
      return;
    }

    const addressToDetect = selectedAddress ?? this.#getSelectedAddress();
    const clientNetworks = this.#getCorrectNetworkClientIdByChainId(chainIds);

    // Determine which chains should use RPC detection
    // If useAccountsAPI is true: supported chains are handled by TokenBalancesController,
    // only use RPC for unsupported chains
    // If useAccountsAPI is false: use RPC for all chains
    const chainsToDetectUsingRpc = this.#useAccountsAPI
      ? clientNetworks.filter(
          ({ chainId }) =>
            !SUPPORTED_NETWORKS_ACCOUNTS_API_V4.includes(chainId),
        )
      : clientNetworks;

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
