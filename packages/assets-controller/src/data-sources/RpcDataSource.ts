import { Web3Provider } from '@ethersproject/providers';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import { toHex } from '@metamask/controller-utils';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { Messenger } from '@metamask/messenger';
import type { NetworkState, NetworkStatus } from '@metamask/network-controller';
import {
  isStrictHexString,
  isCaipChainId,
  parseCaipChainId,
} from '@metamask/utils';
import type { Hex } from '@metamask/utils';
import BigNumberJS from 'bignumber.js';

import type { SubscriptionRequest } from './AbstractDataSource';
import {
  BalanceFetcher,
  MulticallClient,
  TokenDetector,
} from './evm-rpc-services';
import type {
  BalancePollingInput,
  DetectionPollingInput,
} from './evm-rpc-services';
import type {
  Address,
  Provider as RpcProvider,
  TokenListState,
  BalanceFetchResult,
  TokenDetectionResult,
} from './evm-rpc-services';
import { projectLogger, createModuleLogger } from '../logger';
import type {
  ChainId,
  Caip19AssetId,
  AssetBalance,
  AssetMetadata,
  DataRequest,
  DataResponse,
  Middleware,
} from '../types';

const CONTROLLER_NAME = 'RpcDataSource';
const DEFAULT_BALANCE_INTERVAL = 30_000; // 30 seconds
const DEFAULT_DETECTION_INTERVAL = 180_000; // 3 minutes

const log = createModuleLogger(projectLogger, CONTROLLER_NAME);

// Action types
export type RpcDataSourceGetAssetsMiddlewareAction = {
  type: 'RpcDataSource:getAssetsMiddleware';
  handler: () => Middleware;
};

export type RpcDataSourceGetActiveChainsAction = {
  type: 'RpcDataSource:getActiveChains';
  handler: () => Promise<ChainId[]>;
};

export type RpcDataSourceFetchAction = {
  type: 'RpcDataSource:fetch';
  handler: (request: DataRequest) => Promise<DataResponse>;
};

export type RpcDataSourceSubscribeAction = {
  type: 'RpcDataSource:subscribe';
  handler: (request: SubscriptionRequest) => Promise<void>;
};

export type RpcDataSourceUnsubscribeAction = {
  type: 'RpcDataSource:unsubscribe';
  handler: (subscriptionId: string) => Promise<void>;
};

export type RpcDataSourceGetStateAction = ControllerGetStateAction<
  typeof CONTROLLER_NAME,
  RpcDataSourceState
>;

export type RpcDataSourceActions =
  | RpcDataSourceGetStateAction
  | RpcDataSourceGetAssetsMiddlewareAction
  | RpcDataSourceGetActiveChainsAction
  | RpcDataSourceFetchAction
  | RpcDataSourceSubscribeAction
  | RpcDataSourceUnsubscribeAction;

// Event types
export type RpcDataSourceActiveChainsChangedEvent = {
  type: 'RpcDataSource:activeChainsUpdated';
  payload: [ChainId[]];
};

export type RpcDataSourceAssetsUpdatedEvent = {
  type: 'RpcDataSource:assetsUpdated';
  payload: [DataResponse, string | undefined];
};

export type RpcDataSourceStateChangeEvent = ControllerStateChangeEvent<
  typeof CONTROLLER_NAME,
  RpcDataSourceState
>;

export type RpcDataSourceEvents =
  | RpcDataSourceStateChangeEvent
  | RpcDataSourceActiveChainsChangedEvent
  | RpcDataSourceAssetsUpdatedEvent;

// NetworkController action to get state
export type NetworkControllerGetStateAction = {
  type: 'NetworkController:getState';
  handler: () => NetworkState;
};

// NetworkController action to get network client by ID
export type NetworkControllerGetNetworkClientByIdAction = {
  type: 'NetworkController:getNetworkClientById';
  handler: (networkClientId: string) => NetworkClient;
};

// Network client returned by NetworkController
export type NetworkClient = {
  provider: EthereumProvider;
  configuration: {
    chainId: string;
  };
};

// Ethereum provider interface
export type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

// NetworkController state change event
export type NetworkControllerStateChangeEvent = {
  type: 'NetworkController:stateChange';
  payload: [NetworkState, Patch[]];
};

// Patch type for state changes
type Patch = {
  op: 'add' | 'remove' | 'replace';
  path: string[];
  value?: unknown;
};

// Actions to report to AssetsController
type AssetsControllerActiveChainsUpdateAction = {
  type: 'AssetsController:activeChainsUpdate';
  handler: (dataSourceId: string, activeChains: ChainId[]) => void;
};

type AssetsControllerAssetsUpdateAction = {
  type: 'AssetsController:assetsUpdate';
  handler: (response: DataResponse, sourceId: string) => Promise<void>;
};

// TokenListController:getState action
type TokenListControllerGetStateAction = {
  type: 'TokenListController:getState';
  handler: () => {
    tokensChainsCache: Record<
      string,
      { timestamp: number; data: Record<string, unknown> }
    >;
  };
};

// AssetsController:getState action (for assets balance and metadata)
type AssetsControllerGetStateAction = {
  type: 'AssetsController:getState';
  handler: () => {
    assetsMetadata: Record<Caip19AssetId, AssetMetadata>;
    assetsBalance: Record<string, Record<string, { amount: string }>>;
  };
};

// NetworkEnablementController:getState action
type NetworkEnablementControllerGetStateAction = {
  type: 'NetworkEnablementController:getState';
  handler: () => {
    enabledNetworkMap: Record<string, Record<string, boolean>>;
    nativeAssetIdentifiers: Record<string, string>;
  };
};

// Allowed actions that RpcDataSource can call
export type RpcDataSourceAllowedActions =
  | NetworkControllerGetStateAction
  | NetworkControllerGetNetworkClientByIdAction
  | AssetsControllerActiveChainsUpdateAction
  | AssetsControllerAssetsUpdateAction
  | AssetsControllerGetStateAction
  | TokenListControllerGetStateAction
  | NetworkEnablementControllerGetStateAction;

// Allowed events that RpcDataSource can subscribe to
export type RpcDataSourceAllowedEvents = NetworkControllerStateChangeEvent;

export type RpcDataSourceMessenger = Messenger<
  typeof CONTROLLER_NAME,
  RpcDataSourceActions | RpcDataSourceAllowedActions,
  RpcDataSourceEvents | RpcDataSourceAllowedEvents
>;

/** Network status for each chain */
export type ChainStatus = {
  chainId: ChainId;
  status: NetworkStatus;
  name: string;
  nativeCurrency: string;
  /** Network client ID for getting the provider */
  networkClientId: string;
};

/** RpcDataSource is stateless */
export type RpcDataSourceState = Record<never, never>;

export type RpcDataSourceOptions = {
  messenger: RpcDataSourceMessenger;
  /** Request timeout in ms */
  timeout?: number;
  /** Balance polling interval in ms (default: 30s) */
  balanceInterval?: number;
  /** Token detection polling interval in ms (default: 180s / 3 min) */
  detectionInterval?: number;
  /** Whether token detection is enabled */
  tokenDetectionEnabled?: boolean;
};

/**
 * Subscription data stored for each active subscription.
 */
type SubscriptionData = {
  /** Polling tokens from BalanceFetcher */
  balancePollingTokens: string[];
  /** Polling tokens from TokenDetector */
  detectionPollingTokens: string[];
  /** Chain IDs being polled */
  chains: ChainId[];
  /** Accounts being polled */
  accounts: InternalAccount[];
};

/**
 * Convert CAIP chain ID or hex chain ID to hex chain ID.
 *
 * @param chainId - CAIP chain ID or hex chain ID.
 * @returns Hex chain ID.
 */
export const caipChainIdToHex = (chainId: string): Hex => {
  if (isStrictHexString(chainId)) {
    return chainId;
  }

  if (isCaipChainId(chainId)) {
    return toHex(parseCaipChainId(chainId).reference);
  }

  throw new Error('caipChainIdToHex - Failed to provide CAIP-2 or Hex chainId');
};

/**
 * Data source for fetching balances via RPC calls.
 *
 * Orchestrates polling through BalanceFetcher and TokenDetector,
 * each of which handle their own polling intervals.
 *
 * Communicates with AssetsController via Messenger:
 *
 * Actions:
 * - RpcDataSource:getActiveChains
 * - RpcDataSource:fetch
 * - RpcDataSource:subscribe
 * - RpcDataSource:unsubscribe
 *
 * Events:
 * - RpcDataSource:activeChainsUpdated
 * - RpcDataSource:assetsUpdated
 */
export class RpcDataSource extends BaseController<
  typeof CONTROLLER_NAME,
  RpcDataSourceState,
  RpcDataSourceMessenger
> {
  readonly #timeout: number;

  readonly #tokenDetectionEnabled: boolean;

  /** Currently active chains */
  #activeChains: ChainId[] = [];

  /** Network status for each active chain */
  #chainStatuses: Record<ChainId, ChainStatus> = {};

  /** Cache of Web3Provider instances by chainId */
  readonly #providerCache: Map<ChainId, Web3Provider> = new Map();

  /** Active subscriptions by ID */
  readonly #activeSubscriptions: Map<string, SubscriptionData> = new Map();

  // Rpc-datasource components
  readonly #multicallClient: MulticallClient;

  readonly #balanceFetcher: BalanceFetcher;

  readonly #tokenDetector: TokenDetector;

  constructor(options: RpcDataSourceOptions) {
    super({
      name: CONTROLLER_NAME,
      metadata: {},
      state: {},
      messenger: options.messenger,
    });

    this.#timeout = options.timeout ?? 10_000;
    this.#tokenDetectionEnabled = options.tokenDetectionEnabled ?? false;

    const balanceInterval = options.balanceInterval ?? DEFAULT_BALANCE_INTERVAL;
    const detectionInterval =
      options.detectionInterval ?? DEFAULT_DETECTION_INTERVAL;

    log('Initializing RpcDataSource', {
      timeout: this.#timeout,
      balanceInterval,
      detectionInterval,
      tokenDetectionEnabled: this.#tokenDetectionEnabled,
    });

    // Initialize MulticallClient with a provider getter
    this.#multicallClient = new MulticallClient((hexChainId: string) => {
      return this.#getMulticallProvider(hexChainId);
    });

    // Create messenger adapters for BalanceFetcher and TokenDetector
    const balanceFetcherMessenger = {
      call: (
        _action: 'AssetsController:getState',
      ): {
        assetsBalance: Record<string, Record<string, { amount: string }>>;
      } => {
        const state = this.messenger.call('AssetsController:getState');
        return {
          assetsBalance: (state.assetsBalance ?? {}) as Record<
            string,
            Record<string, { amount: string }>
          >,
        };
      },
    };

    const tokenDetectorMessenger = {
      call: (_action: 'TokenListController:getState'): TokenListState => {
        return this.messenger.call(
          'TokenListController:getState',
        ) as TokenListState;
      },
    };

    // Initialize BalanceFetcher with polling interval
    this.#balanceFetcher = new BalanceFetcher(
      this.#multicallClient,
      balanceFetcherMessenger,
      { pollingInterval: balanceInterval },
    );
    this.#balanceFetcher.setOnBalanceUpdate(
      this.#handleBalanceUpdate.bind(this),
    );

    // Initialize TokenDetector with polling interval
    this.#tokenDetector = new TokenDetector(
      this.#multicallClient,
      tokenDetectorMessenger,
      { pollingInterval: detectionInterval },
    );
    this.#tokenDetector.setOnDetectionUpdate(
      this.#handleDetectionUpdate.bind(this),
    );

    this.#registerActionHandlers();
    this.#subscribeToNetworkController();
    this.#initializeFromNetworkController();
  }

  /**
   * Convert a raw balance to human-readable format using decimals.
   *
   * @param rawBalance - The raw balance string.
   * @param decimals - The number of decimals for the token.
   * @returns The human-readable balance string.
   */
  #convertToHumanReadable(rawBalance: string, decimals: number): string {
    const rawAmount = new BigNumberJS(rawBalance);
    const divisor = new BigNumberJS(10).pow(decimals);
    return rawAmount.dividedBy(divisor).toString();
  }

  /**
   * Collect metadata for a list of balance entries.
   * For native tokens, generates metadata from chain status.
   * For ERC20 tokens, looks up from existing state or token list.
   *
   * @param balances - Array of balance entries with assetId.
   * @param chainId - The CAIP-2 chain ID.
   * @returns Record of asset metadata keyed by asset ID.
   */
  #collectMetadataForBalances(
    balances: { assetId: Caip19AssetId }[],
    chainId: ChainId,
  ): Record<Caip19AssetId, AssetMetadata> {
    const assetsMetadata: Record<Caip19AssetId, AssetMetadata> = {};
    const existingMetadata = this.#getExistingAssetsMetadata();

    for (const balance of balances) {
      const isNative = balance.assetId.includes('/slip44:');
      if (isNative) {
        const chainStatus = this.#chainStatuses[chainId];

        if (chainStatus) {
          assetsMetadata[balance.assetId] = {
            type: 'native',
            symbol: chainStatus.nativeCurrency,
            name: chainStatus.nativeCurrency,
            decimals: 18,
          };
        }
      } else {
        // For ERC20 tokens, try existing metadata from state first
        const existingMeta = existingMetadata[balance.assetId];

        if (existingMeta) {
          assetsMetadata[balance.assetId] = existingMeta;
        } else {
          // Fallback to token list if not in state
          const tokenListMeta = this.#getTokenMetadataFromTokenList(
            balance.assetId,
          );
          if (tokenListMeta) {
            assetsMetadata[balance.assetId] = tokenListMeta;
          } else {
            // Default metadata for unknown ERC20 tokens.
            // Use 18 decimals (the standard for most ERC20 tokens)
            // to ensure consistent human-readable balance format.
            assetsMetadata[balance.assetId] = {
              type: 'erc20',
              symbol: '',
              name: '',
              decimals: 18,
            };
          }
        }
      }
    }

    return assetsMetadata;
  }

  /**
   * Handle balance update from BalanceFetcher.
   *
   * @param result - The balance fetch result.
   */
  #handleBalanceUpdate(result: BalanceFetchResult): void {
    const newBalances: Record<string, { amount: string }> = {};

    // Convert hex chain ID to CAIP-2 format
    const chainIdDecimal = parseInt(result.chainId, 16);
    const caipChainId = `eip155:${chainIdDecimal}` as ChainId;

    // Collect metadata for all balances
    const assetsMetadata = this.#collectMetadataForBalances(
      result.balances,
      caipChainId,
    );

    // Convert balances to human-readable format using metadata
    for (const balance of result.balances) {
      const metadata = assetsMetadata[balance.assetId];
      // Default to 18 decimals (ERC20 standard) for consistent human-readable format
      const decimals = metadata?.decimals ?? 18;
      const humanReadableAmount = this.#convertToHumanReadable(
        balance.balance,
        decimals,
      );

      newBalances[balance.assetId] = {
        amount: humanReadableAmount,
      };
    }

    // Only send new data to AssetsController - it handles merging atomically
    // to avoid race conditions when concurrent updates occur for the same account
    const response: DataResponse = {
      assetsBalance: {
        [result.accountId]: newBalances,
      },
      assetsMetadata,
    };

    log('Balance update response', {
      accountId: result.accountId,
      newBalanceCount: Object.keys(newBalances).length,
    });

    this.messenger
      .call('AssetsController:assetsUpdate', response, CONTROLLER_NAME)
      .catch((error) => {
        log('Failed to update assets', { error });
      });
  }

  /**
   * Handle detection update from TokenDetector.
   *
   * @param result - The token detection result.
   */
  #handleDetectionUpdate(result: TokenDetectionResult): void {
    log('Detected new tokens', {
      count: result.detectedAssets.length,
    });

    // Build new metadata from detected assets
    const newMetadata: Record<Caip19AssetId, AssetMetadata> = {};
    if (result.detectedAssets.length > 0) {
      for (const asset of result.detectedAssets) {
        // Only include if we have metadata (symbol and decimals at minimum)
        if (asset.symbol && asset.decimals !== undefined) {
          newMetadata[asset.assetId] = {
            type: 'erc20',
            symbol: asset.symbol,
            name: asset.name ?? asset.symbol,
            decimals: asset.decimals,
            image: asset.image,
          };
        }
      }
    }

    // Build new balances from detected tokens
    const newBalances: Record<string, { amount: string }> = {};
    if (result.detectedBalances.length > 0) {
      for (const balance of result.detectedBalances) {
        // Get decimals from the detected asset metadata
        const detectedAsset = result.detectedAssets.find(
          (asset) => asset.assetId === balance.assetId,
        );
        // Default to 18 decimals (ERC20 standard) for consistent human-readable format
        const decimals = detectedAsset?.decimals ?? 18;
        const humanReadableAmount = this.#convertToHumanReadable(
          balance.balance,
          decimals,
        );

        newBalances[balance.assetId] = {
          amount: humanReadableAmount,
        };
      }
    }

    // Only send new data to AssetsController - it handles merging atomically
    // to avoid race conditions when concurrent updates occur for the same account
    const response: DataResponse = {
      detectedAssets: {
        [result.accountId]: result.detectedAssets.map((asset) => asset.assetId),
      },
      assetsMetadata: newMetadata,
      assetsBalance: {
        [result.accountId]: newBalances,
      },
    };

    this.messenger
      .call('AssetsController:assetsUpdate', response, CONTROLLER_NAME)
      .catch((error) => {
        log('Failed to update detected assets', { error });
      });
  }

  #registerActionHandlers(): void {
    const getAssetsMiddlewareHandler: RpcDataSourceGetAssetsMiddlewareAction['handler'] =
      () => this.assetsMiddleware;

    const getActiveChainsHandler: RpcDataSourceGetActiveChainsAction['handler'] =
      async () => this.getActiveChains();

    const fetchHandler: RpcDataSourceFetchAction['handler'] = async (request) =>
      this.fetch(request);

    const subscribeHandler: RpcDataSourceSubscribeAction['handler'] = async (
      request,
    ) => this.subscribe(request);

    const unsubscribeHandler: RpcDataSourceUnsubscribeAction['handler'] =
      async (subscriptionId) => this.unsubscribe(subscriptionId);

    this.messenger.registerActionHandler(
      'RpcDataSource:getAssetsMiddleware',
      getAssetsMiddlewareHandler,
    );

    this.messenger.registerActionHandler(
      'RpcDataSource:getActiveChains',
      getActiveChainsHandler,
    );

    this.messenger.registerActionHandler('RpcDataSource:fetch', fetchHandler);

    this.messenger.registerActionHandler(
      'RpcDataSource:subscribe',
      subscribeHandler,
    );

    this.messenger.registerActionHandler(
      'RpcDataSource:unsubscribe',
      unsubscribeHandler,
    );
  }

  #subscribeToNetworkController(): void {
    this.messenger.subscribe(
      'NetworkController:stateChange',
      (networkState: NetworkState) => {
        log('NetworkController state changed');
        this.#clearProviderCache();
        this.#updateFromNetworkState(networkState);
      },
    );
  }

  #initializeFromNetworkController(): void {
    log('Initializing from NetworkController');
    try {
      const networkState = this.messenger.call('NetworkController:getState');
      this.#updateFromNetworkState(networkState);
    } catch (error) {
      log('Failed to initialize from NetworkController', error);
    }
  }

  #updateFromNetworkState(networkState: NetworkState): void {
    const { networkConfigurationsByChainId, networksMetadata } = networkState;

    const chainStatuses: Record<ChainId, ChainStatus> = {};
    const activeChains: ChainId[] = [];

    for (const [hexChainId, config] of Object.entries(
      networkConfigurationsByChainId,
    )) {
      const decimalChainId = parseInt(hexChainId, 16);
      const caip2ChainId = `eip155:${decimalChainId}` as ChainId;

      const defaultRpcEndpoint =
        config.rpcEndpoints[config.defaultRpcEndpointIndex];
      if (!defaultRpcEndpoint) {
        continue;
      }

      const { networkClientId } = defaultRpcEndpoint;
      const metadata = networksMetadata[networkClientId];

      const status: NetworkStatus =
        metadata?.status ?? ('unknown' as NetworkStatus);

      chainStatuses[caip2ChainId] = {
        chainId: caip2ChainId,
        status,
        name: config.name,
        nativeCurrency: config.nativeCurrency,
        networkClientId,
      };

      if (status === 'available' || status === 'unknown') {
        activeChains.push(caip2ChainId);
      }
    }

    log('Network state updated', {
      configuredChains: Object.keys(chainStatuses),
      activeChains,
    });

    // Check if chains changed
    const previousChains = new Set(this.#activeChains);
    const hasChanges =
      previousChains.size !== activeChains.length ||
      activeChains.some((chain) => !previousChains.has(chain));

    // Update internal state
    this.#chainStatuses = chainStatuses;
    this.#activeChains = activeChains;

    if (hasChanges) {
      this.messenger.call(
        'AssetsController:activeChainsUpdate',
        CONTROLLER_NAME,
        activeChains,
      );
    }
  }

  #getProvider(chainId: ChainId): Web3Provider | undefined {
    const cached = this.#providerCache.get(chainId);
    if (cached) {
      return cached;
    }

    const chainStatus = this.#chainStatuses[chainId];
    if (!chainStatus) {
      return undefined;
    }

    try {
      const networkClient = this.messenger.call(
        'NetworkController:getNetworkClientById',
        chainStatus.networkClientId,
      );

      const web3Provider = new Web3Provider(networkClient.provider);
      this.#providerCache.set(chainId, web3Provider);

      return web3Provider;
    } catch (error) {
      log('Failed to get provider for chain', { chainId, error });
      return undefined;
    }
  }

  /**
   * Get provider for MulticallClient using a hex chainId.
   *
   * @param hexChainId - The hex string representation of the chain id.
   * @returns An RpcProvider instance for the specified chain.
   */
  #getMulticallProvider(hexChainId: string): RpcProvider {
    const decimalChainId = parseInt(hexChainId, 16);
    const caip2ChainId = `eip155:${decimalChainId}` as ChainId;

    const web3Provider = this.#getProvider(caip2ChainId);

    if (!web3Provider) {
      throw new Error(`No provider available for chain ${hexChainId}`);
    }

    return {
      call: async (params: { to: string; data: string }): Promise<string> => {
        return web3Provider.call({
          to: params.to,
          data: params.data,
        });
      },
      getBalance: async (address: string): Promise<{ toString(): string }> => {
        const balance = await web3Provider.getBalance(address);
        return balance;
      },
    };
  }

  #clearProviderCache(): void {
    this.#providerCache.clear();
  }

  #accountSupportsChain(account: InternalAccount, chainId: ChainId): boolean {
    const scopes = account.scopes ?? [];

    if (scopes.length === 0) {
      return true;
    }

    const [chainNamespace, chainReference] = chainId.split(':');

    for (const scope of scopes) {
      const [scopeNamespace, scopeReference] = (scope as string).split(':');

      if (scopeNamespace !== chainNamespace) {
        continue;
      }

      // Wildcard scope (e.g., eip155:0) matches all chains in the namespace
      if (scopeReference === '0') {
        return true;
      }

      // RpcDataSource only handles eip155 (EVM) chains
      // Normalize hex chain references (e.g., 0x1 -> 1) for comparison
      const normalizedScopeRef = scopeReference?.startsWith('0x')
        ? parseInt(scopeReference, 16).toString()
        : scopeReference;
      if (normalizedScopeRef === chainReference) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get the data source name.
   *
   * @returns The name of this data source.
   */
  getName(): string {
    return this.name;
  }

  /**
   * Get currently active chains.
   *
   * @returns Promise resolving to array of active chain IDs.
   */
  async getActiveChains(): Promise<ChainId[]> {
    return this.#activeChains;
  }

  /**
   * Get the status of all configured chains.
   *
   * @returns Record of chain statuses keyed by chain ID.
   */
  getChainStatuses(): Record<ChainId, ChainStatus> {
    return { ...this.#chainStatuses };
  }

  /**
   * Get the status of a specific chain.
   *
   * @param chainId - The chain ID to get status for.
   * @returns The chain status or undefined if not found.
   */
  getChainStatus(chainId: ChainId): ChainStatus | undefined {
    return this.#chainStatuses[chainId];
  }

  /**
   * Set the balance polling interval.
   *
   * @param interval - The polling interval in milliseconds.
   */
  setBalancePollingInterval(interval: number): void {
    log('Setting balance polling interval', { interval });
    this.#balanceFetcher.setIntervalLength(interval);
  }

  /**
   * Get the current balance polling interval.
   *
   * @returns The polling interval in milliseconds, or undefined if not set.
   */
  getBalancePollingInterval(): number | undefined {
    return this.#balanceFetcher.getIntervalLength();
  }

  /**
   * Set the token detection polling interval.
   *
   * @param interval - The polling interval in milliseconds.
   */
  setDetectionPollingInterval(interval: number): void {
    log('Setting detection polling interval', { interval });
    this.#tokenDetector.setIntervalLength(interval);
  }

  /**
   * Get the current token detection polling interval.
   *
   * @returns The polling interval in milliseconds, or undefined if not set.
   */
  getDetectionPollingInterval(): number | undefined {
    return this.#tokenDetector.getIntervalLength();
  }

  async fetch(request: DataRequest): Promise<DataResponse> {
    const response: DataResponse = {};

    const chainsToFetch = request.chainIds.filter((chainId) =>
      this.#activeChains.includes(chainId),
    );

    log('Fetch requested', {
      accounts: request.accounts.map((a) => a.id),
      requestedChains: request.chainIds,
      chainsToFetch,
    });

    if (chainsToFetch.length === 0) {
      log('No active chains to fetch');
      return response;
    }

    const assetsBalance: Record<
      string,
      Record<Caip19AssetId, AssetBalance>
    > = {};
    const assetsMetadata: Record<Caip19AssetId, AssetMetadata> = {};
    const failedChains: ChainId[] = [];

    // Fetch balances for each chain using BalanceFetcher
    for (const chainId of chainsToFetch) {
      const hexChainId = caipChainIdToHex(chainId);

      for (const account of request.accounts) {
        if (!this.#accountSupportsChain(account, chainId)) {
          continue;
        }

        const { address, id: accountId } = account;

        try {
          // Use BalanceFetcher for batched balance fetching
          const result = await this.#balanceFetcher.fetchBalancesForTokens(
            hexChainId,
            accountId,
            address as Address,
            [], // Empty array means just native token
            { includeNative: true },
          );

          if (!assetsBalance[accountId]) {
            assetsBalance[accountId] = {};
          }

          // Collect metadata for all balances
          const balanceMetadata = this.#collectMetadataForBalances(
            result.balances,
            chainId,
          );
          Object.assign(assetsMetadata, balanceMetadata);

          // Convert balances to human-readable format
          for (const balance of result.balances) {
            const metadata = assetsMetadata[balance.assetId];
            // Default to 18 decimals (ERC20 standard) for consistent human-readable format
            const decimals = metadata?.decimals ?? 18;
            const humanReadableAmount = this.#convertToHumanReadable(
              balance.balance,
              decimals,
            );

            assetsBalance[accountId][balance.assetId] = {
              amount: humanReadableAmount,
            };
          }
        } catch (error) {
          log('Failed to fetch balance', { address, chainId, error });

          if (!assetsBalance[accountId]) {
            assetsBalance[accountId] = {};
          }
          const nativeAssetId = this.#buildNativeAssetId(chainId);
          assetsBalance[accountId][nativeAssetId] = { amount: '0' };

          // Even on error, include native token metadata
          const chainStatus = this.#chainStatuses[chainId];
          if (chainStatus) {
            assetsMetadata[nativeAssetId] = {
              type: 'native',
              symbol: chainStatus.nativeCurrency,
              name: chainStatus.nativeCurrency,
              decimals: 18,
            };
          }

          if (!failedChains.includes(chainId)) {
            failedChains.push(chainId);
          }
        }
      }
    }

    if (failedChains.length > 0) {
      log('Fetch PARTIAL - some chains failed', {
        successChains: chainsToFetch.filter(
          (chain) => !failedChains.includes(chain),
        ),
        failedChains,
      });

      response.errors = {};
      for (const chainId of failedChains) {
        response.errors[chainId] = 'RPC fetch failed';
      }
    } else {
      log('Fetch SUCCESS', {
        chains: chainsToFetch,
        accountCount: Object.keys(assetsBalance).length,
      });
    }

    response.assetsBalance = assetsBalance;

    // Include metadata for native tokens if we have any
    if (Object.keys(assetsMetadata).length > 0) {
      response.assetsMetadata = assetsMetadata;
    }

    return response;
  }

  /**
   * Run token detection for an account on a chain.
   *
   * @param chainId - The chain ID to detect tokens on.
   * @param account - The account to detect tokens for.
   * @returns Promise resolving to a DataResponse with detected assets.
   */
  async detectTokens(
    chainId: ChainId,
    account: InternalAccount,
  ): Promise<DataResponse> {
    if (!this.#tokenDetectionEnabled) {
      return {};
    }

    const hexChainId = caipChainIdToHex(chainId);
    const { address, id: accountId } = account;

    log('Running token detection', { chainId, accountId });

    try {
      const result = await this.#tokenDetector.detectTokens(
        hexChainId,
        accountId,
        address as Address,
      );

      if (result.detectedAssets.length === 0) {
        log('No new tokens detected');
        return {};
      }

      log('Detected new tokens', {
        count: result.detectedAssets.length,
        chainId,
        accountId,
      });

      // Convert detected assets to DataResponse format
      const balances: Record<Caip19AssetId, AssetBalance> = {};
      const assetsMetadata: Record<Caip19AssetId, AssetMetadata> = {};

      // Build metadata from detected assets
      for (const asset of result.detectedAssets) {
        if (asset.symbol && asset.decimals !== undefined) {
          assetsMetadata[asset.assetId] = {
            type: 'erc20',
            symbol: asset.symbol,
            name: asset.name ?? asset.symbol,
            decimals: asset.decimals,
            image: asset.image,
          };
        }
      }

      // Add balances for detected tokens (converted to human-readable format)
      for (const balance of result.detectedBalances) {
        const detectedAsset = result.detectedAssets.find(
          (asset) => asset.assetId === balance.assetId,
        );
        // Default to 18 decimals (ERC20 standard) for consistent human-readable format
        const decimals = detectedAsset?.decimals ?? 18;
        const humanReadableAmount = this.#convertToHumanReadable(
          balance.balance,
          decimals,
        );

        balances[balance.assetId] = {
          amount: humanReadableAmount,
        };
      }

      const response: DataResponse = {
        detectedAssets: {
          [accountId]: result.detectedAssets.map((asset) => asset.assetId),
        },
        assetsBalance: {
          [accountId]: balances,
        },
      };

      // Include metadata if we have any
      if (Object.keys(assetsMetadata).length > 0) {
        response.assetsMetadata = assetsMetadata;
      }

      return response;
    } catch (error) {
      log('Token detection failed', { chainId, accountId, error });
      return {};
    }
  }

  get assetsMiddleware(): Middleware {
    return async (context, next) => {
      const { request } = context;

      const supportedChains = request.chainIds.filter((chainId) =>
        this.#activeChains.includes(chainId),
      );

      if (supportedChains.length === 0) {
        return next(context);
      }

      let successfullyHandledChains: ChainId[] = [];

      log('Middleware fetching', {
        chains: supportedChains,
        accounts: request.accounts.map((a) => a.id),
      });

      const response = await this.fetch({
        ...request,
        chainIds: supportedChains,
      });

      if (response.assetsBalance) {
        context.response.assetsBalance ??= {};
        for (const [accountId, accountBalances] of Object.entries(
          response.assetsBalance,
        )) {
          context.response.assetsBalance[accountId] ??= {};
          context.response.assetsBalance[accountId] = {
            ...context.response.assetsBalance[accountId],
            ...accountBalances,
          };
        }
      }

      if (response.assetsMetadata) {
        context.response.assetsMetadata ??= {};
        context.response.assetsMetadata = {
          ...context.response.assetsMetadata,
          ...response.assetsMetadata,
        };
      }

      const failedChains = new Set(Object.keys(response.errors ?? {}));
      successfullyHandledChains = supportedChains.filter(
        (chainId) => !failedChains.has(chainId),
      );

      if (successfullyHandledChains.length > 0) {
        const remainingChains = request.chainIds.filter(
          (chainId) => !successfullyHandledChains.includes(chainId),
        );

        return next({
          ...context,
          request: {
            ...request,
            chainIds: remainingChains,
          },
        });
      }

      return next(context);
    };
  }

  /**
   * Subscribe to updates for the given request.
   * Starts polling through BalanceFetcher and TokenDetector.
   *
   * @param subscriptionRequest - The subscription request details.
   */
  async subscribe(subscriptionRequest: SubscriptionRequest): Promise<void> {
    const { request, subscriptionId, isUpdate } = subscriptionRequest;

    const chainsToSubscribe = request.chainIds.filter((chainId) =>
      this.#activeChains.includes(chainId),
    );

    log('Subscribe requested', {
      subscriptionId,
      isUpdate,
      accounts: request.accounts.map((a) => a.id),
      chainsToSubscribe,
    });

    if (chainsToSubscribe.length === 0) {
      log('No active chains to subscribe');
      return;
    }

    // Handle subscription update - restart polling for new chains
    if (isUpdate) {
      const existing = this.#activeSubscriptions.get(subscriptionId);
      if (existing) {
        log('Updating existing subscription - restarting polling', {
          subscriptionId,
          existingChains: existing.chains,
          newChains: chainsToSubscribe,
        });
        // Don't return early - continue to unsubscribe and restart polling
      }
    }

    // Clean up existing subscription (stops old polling)
    await this.unsubscribe(subscriptionId);

    // Start polling through BalanceFetcher and TokenDetector
    const balancePollingTokens: string[] = [];
    const detectionPollingTokens: string[] = [];

    for (const chainId of chainsToSubscribe) {
      const hexChainId = caipChainIdToHex(chainId);

      for (const account of request.accounts) {
        if (!this.#accountSupportsChain(account, chainId)) {
          continue;
        }

        const { address, id: accountId } = account;

        // Start balance polling
        const balanceInput: BalancePollingInput = {
          chainId: hexChainId,
          accountId,
          accountAddress: address as Address,
        };
        const balanceToken = this.#balanceFetcher.startPolling(balanceInput);
        balancePollingTokens.push(balanceToken);

        // Start detection polling if enabled
        if (this.#tokenDetectionEnabled) {
          const detectionInput: DetectionPollingInput = {
            chainId: hexChainId,
            accountId,
            accountAddress: address as Address,
          };
          const detectionToken =
            this.#tokenDetector.startPolling(detectionInput);
          detectionPollingTokens.push(detectionToken);
        }
      }
    }

    // Store subscription data
    this.#activeSubscriptions.set(subscriptionId, {
      balancePollingTokens,
      detectionPollingTokens,
      chains: chainsToSubscribe,
      accounts: request.accounts,
    });

    log('Subscription SUCCESS', {
      subscriptionId,
      chains: chainsToSubscribe,
      balancePollingCount: balancePollingTokens.length,
      detectionPollingCount: detectionPollingTokens.length,
    });
  }

  /**
   * Unsubscribe from updates and stop polling.
   *
   * @param subscriptionId - The subscription ID to unsubscribe.
   */
  async unsubscribe(subscriptionId: string): Promise<void> {
    const subscription = this.#activeSubscriptions.get(subscriptionId);
    if (subscription) {
      // Stop balance polling
      for (const token of subscription.balancePollingTokens) {
        this.#balanceFetcher.stopPollingByPollingToken(token);
      }

      // Stop detection polling
      for (const token of subscription.detectionPollingTokens) {
        this.#tokenDetector.stopPollingByPollingToken(token);
      }

      this.#activeSubscriptions.delete(subscriptionId);
      log('Unsubscribed and stopped polling', { subscriptionId });
    }
  }

  /**
   * Build the native asset ID for a given chain using NetworkEnablementController state.
   *
   * @param chainId - The CAIP-2 chain ID (e.g., "eip155:1")
   * @returns The CAIP-19 native asset ID (e.g., "eip155:1/slip44:60")
   */
  #buildNativeAssetId(chainId: ChainId): Caip19AssetId {
    const { nativeAssetIdentifiers } = this.messenger.call(
      'NetworkEnablementController:getState',
    );

    return (nativeAssetIdentifiers[chainId] ??
      `${chainId}/slip44:60`) as Caip19AssetId;
  }

  /**
   * Get existing assets metadata from AssetsController state.
   * Used to include metadata for ERC20 tokens when returning balance updates.
   *
   * @returns Record of asset IDs to their metadata.
   */
  #getExistingAssetsMetadata(): Record<Caip19AssetId, AssetMetadata> {
    try {
      const state = this.messenger.call('AssetsController:getState') as {
        assetsMetadata?: Record<Caip19AssetId, AssetMetadata>;
      };
      return (state.assetsMetadata ?? {}) as unknown as Record<
        Caip19AssetId,
        AssetMetadata
      >;
    } catch {
      // If AssetsController:getState fails, return empty metadata
      return {};
    }
  }

  /**
   * Get token metadata from TokenListController for an ERC20 token.
   * Used as a fallback when metadata is not in AssetsController state.
   *
   * @param assetId - The CAIP-19 asset ID (e.g., "eip155:1/erc20:0x...")
   * @returns Token metadata if found in token list, undefined otherwise.
   */
  #getTokenMetadataFromTokenList(
    assetId: Caip19AssetId,
  ): AssetMetadata | undefined {
    try {
      // Parse asset ID to get chain and token address
      // Format: eip155:{chainId}/erc20:{address}
      const [chainPart, assetPart] = assetId.split('/');
      if (!assetPart?.startsWith('erc20:')) {
        return undefined;
      }

      const tokenAddress = assetPart.slice(6); // Remove 'erc20:' prefix
      const chainIdDecimal = chainPart.split(':')[1];
      const hexChainId = `0x${parseInt(chainIdDecimal, 10).toString(16)}`;

      const tokenListState = this.messenger.call(
        'TokenListController:getState',
      );
      const chainCacheEntry = tokenListState.tokensChainsCache[hexChainId];
      const chainTokenList = chainCacheEntry?.data;

      if (!chainTokenList) {
        return undefined;
      }

      // Look up token by address (case-insensitive)
      const lowerAddress = tokenAddress.toLowerCase();
      for (const [address, tokenData] of Object.entries(chainTokenList)) {
        if (address.toLowerCase() === lowerAddress) {
          const token = tokenData as {
            symbol?: string;
            name?: string;
            decimals?: number;
            iconUrl?: string;
          };
          if (token.symbol && token.decimals !== undefined) {
            return {
              type: 'erc20',
              symbol: token.symbol,
              name: token.name ?? token.symbol,
              decimals: token.decimals,
              image: token.iconUrl,
            };
          }
        }
      }

      return undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Destroy the data source and clean up resources.
   */
  destroy(): void {
    log('Destroying RpcDataSource');

    // Stop all polling
    this.#balanceFetcher.stopAllPolling();
    this.#tokenDetector.stopAllPolling();

    // Clear subscriptions
    this.#activeSubscriptions.clear();

    // Clear caches
    this.#providerCache.clear();
  }
}

export function createRpcDataSource(
  options: RpcDataSourceOptions,
): RpcDataSource {
  return new RpcDataSource(options);
}
