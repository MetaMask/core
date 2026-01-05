import { Web3Provider } from '@ethersproject/providers';
import type { Messenger } from '@metamask/messenger';
import type { NetworkState, NetworkStatus } from '@metamask/network-controller';

import { projectLogger, createModuleLogger } from '../../logger';
import type {
  ChainId,
  Caip19AssetId,
  AssetBalance,
  DataRequest,
  DataResponse,
  Middleware,
} from '../types';
import {
  AbstractDataSource,
  type DataSourceState,
  type SubscriptionRequest,
} from './AbstractDataSource';

// ============================================================================
// CONSTANTS
// ============================================================================

const CONTROLLER_NAME = 'RpcDataSource';
const DEFAULT_POLL_INTERVAL = 30_000;

const log = createModuleLogger(projectLogger, CONTROLLER_NAME);

// ============================================================================
// MESSENGER TYPES
// ============================================================================

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

export type RpcDataSourceActions =
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

export type RpcDataSourceEvents =
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

// Allowed actions that RpcDataSource can call
export type RpcDataSourceAllowedActions =
  | NetworkControllerGetStateAction
  | NetworkControllerGetNetworkClientByIdAction
  | AssetsControllerActiveChainsUpdateAction
  | AssetsControllerAssetsUpdateAction;

// Allowed events that RpcDataSource can subscribe to
export type RpcDataSourceAllowedEvents = NetworkControllerStateChangeEvent;

export type RpcDataSourceMessenger = Messenger<
  typeof CONTROLLER_NAME,
  RpcDataSourceActions | RpcDataSourceAllowedActions,
  RpcDataSourceEvents | RpcDataSourceAllowedEvents
>;

// ============================================================================
// STATE
// ============================================================================

/** Network status for each chain */
export type ChainStatus = {
  chainId: ChainId;
  status: NetworkStatus;
  name: string;
  nativeCurrency: string;
  /** Network client ID for getting the provider */
  networkClientId: string;
};

export interface RpcDataSourceState extends DataSourceState {
  /** Network status for each active chain */
  chainStatuses: Record<ChainId, ChainStatus>;
}

const defaultState: RpcDataSourceState = {
  activeChains: [],
  chainStatuses: {},
};

// ============================================================================
// OPTIONS
// ============================================================================

export interface RpcDataSourceOptions {
  messenger: RpcDataSourceMessenger;
  /** Request timeout in ms */
  timeout?: number;
  /** Polling interval in ms */
  pollInterval?: number;
  state?: Partial<RpcDataSourceState>;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function buildNativeAssetId(chainId: ChainId): Caip19AssetId {
  return `${chainId}/slip44:60` as Caip19AssetId;
}

// ============================================================================
// RPC DATA SOURCE
// ============================================================================

/**
 * Data source for fetching balances via RPC calls.
 *
 * Used as a fallback when the Accounts API doesn't support a chain.
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
export class RpcDataSource extends AbstractDataSource<
  typeof CONTROLLER_NAME,
  RpcDataSourceState
> {
  readonly #messenger: RpcDataSourceMessenger;

  readonly #timeout: number;

  readonly #pollInterval: number;

  /** Cache of Web3Provider instances by chainId */
  readonly #providerCache: Map<ChainId, Web3Provider> = new Map();

  constructor(options: RpcDataSourceOptions) {
    super(CONTROLLER_NAME, {
      ...defaultState,
      ...options.state,
    });

    this.#messenger = options.messenger;
    this.#timeout = options.timeout ?? 10_000;
    this.#pollInterval = options.pollInterval ?? DEFAULT_POLL_INTERVAL;

    log('Initializing RpcDataSource', {
      timeout: this.#timeout,
      pollInterval: this.#pollInterval,
    });

    this.#registerActionHandlers();
    this.#subscribeToNetworkController();
    this.#initializeFromNetworkController();
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

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

    this.#messenger.registerActionHandler(
      'RpcDataSource:getAssetsMiddleware',
      getAssetsMiddlewareHandler,
    );

    this.#messenger.registerActionHandler(
      'RpcDataSource:getActiveChains',
      getActiveChainsHandler,
    );

    this.#messenger.registerActionHandler('RpcDataSource:fetch', fetchHandler);

    this.#messenger.registerActionHandler(
      'RpcDataSource:subscribe',
      subscribeHandler,
    );

    this.#messenger.registerActionHandler(
      'RpcDataSource:unsubscribe',
      unsubscribeHandler,
    );
  }

  /**
   * Subscribe to NetworkController state changes.
   */
  #subscribeToNetworkController(): void {
    this.#messenger.subscribe(
      'NetworkController:stateChange',
      (networkState: NetworkState) => {
        log('NetworkController state changed');
        // Clear provider cache since network configurations may have changed
        this.#clearProviderCache();
        this.#updateFromNetworkState(networkState);
      },
    );
  }

  /**
   * Initialize active chains from NetworkController state.
   */
  #initializeFromNetworkController(): void {
    log('Initializing from NetworkController');
    try {
      const networkState = this.#messenger.call('NetworkController:getState');
      this.#updateFromNetworkState(networkState);
    } catch (error) {
      log('Failed to initialize from NetworkController', error);
    }
  }

  /**
   * Update active chains and statuses from NetworkController state.
   * Only chains with an available provider are considered active.
   */
  #updateFromNetworkState(networkState: NetworkState): void {
    const { networkConfigurationsByChainId, networksMetadata } = networkState;

    const chainStatuses: Record<ChainId, ChainStatus> = {};
    const activeChains: ChainId[] = [];

    // Iterate through all configured networks
    for (const [hexChainId, config] of Object.entries(
      networkConfigurationsByChainId,
    )) {
      // Convert hex chainId to CAIP-2 format (eip155:decimal)
      const decimalChainId = parseInt(hexChainId, 16);
      const caip2ChainId = `eip155:${decimalChainId}` as ChainId;

      // Get the default RPC endpoint's network client ID
      const defaultRpcEndpoint =
        config.rpcEndpoints[config.defaultRpcEndpointIndex];
      if (!defaultRpcEndpoint) {
        continue;
      }

      const networkClientId = defaultRpcEndpoint.networkClientId;
      const metadata = networksMetadata[networkClientId];

      // Determine status - default to 'unknown' if not in metadata
      const status: NetworkStatus =
        metadata?.status ?? ('unknown' as NetworkStatus);

      chainStatuses[caip2ChainId] = {
        chainId: caip2ChainId,
        status,
        name: config.name,
        nativeCurrency: config.nativeCurrency,
        networkClientId,
      };

      // Only include chains that have an available status
      // (not degraded/unavailable/blocked)
      if (status === 'available' || status === 'unknown') {
        activeChains.push(caip2ChainId);
      }
    }

    log('Network state updated', {
      configuredChains: Object.keys(chainStatuses),
      activeChains,
    });

    // Update state
    this.state.chainStatuses = chainStatuses;

    // Update active chains and report to AssetsController
    this.updateActiveChains(activeChains, (chains) =>
      this.#messenger.call('AssetsController:activeChainsUpdate', CONTROLLER_NAME, chains),
    );
  }

  // ============================================================================
  // PROVIDER MANAGEMENT
  // ============================================================================

  /**
   * Get or create a Web3Provider for a chain.
   * Uses NetworkController to get the underlying provider.
   */
  #getProvider(chainId: ChainId): Web3Provider | undefined {
    // Check cache first
    const cached = this.#providerCache.get(chainId);
    if (cached) {
      return cached;
    }

    // Get chain status to find networkClientId
    const chainStatus = this.state.chainStatuses[chainId];
    if (!chainStatus) {
      return undefined;
    }

    try {
      // Get network client from NetworkController (like TokenBalancesController)
      const networkClient = this.#messenger.call(
        'NetworkController:getNetworkClientById',
        chainStatus.networkClientId,
      );

      // Create Web3Provider directly
      const web3Provider = new Web3Provider(networkClient.provider);

      // Cache for reuse
      this.#providerCache.set(chainId, web3Provider);

      return web3Provider;
    } catch (error) {
      console.error(
        `[RpcDataSource] Failed to get provider for chain ${chainId}:`,
        error,
      );
      return undefined;
    }
  }

  /**
   * Clear provider cache (e.g., when network configuration changes).
   */
  #clearProviderCache(): void {
    this.#providerCache.clear();
  }

  // ============================================================================
  // CHAIN STATUS
  // ============================================================================

  /**
   * Get the status of all configured chains.
   */
  getChainStatuses(): Record<ChainId, ChainStatus> {
    return { ...this.state.chainStatuses };
  }

  /**
   * Get the status of a specific chain.
   */
  getChainStatus(chainId: ChainId): ChainStatus | undefined {
    return this.state.chainStatuses[chainId];
  }

  // ============================================================================
  // FETCH
  // ============================================================================

  async fetch(request: DataRequest): Promise<DataResponse> {
    const response: DataResponse = {};

    // Filter to active chains
    const chainsToFetch = request.chainIds.filter((chainId) =>
      this.state.activeChains.includes(chainId),
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
    const failedChains: ChainId[] = [];

    // Fetch native balance for each chain
    for (const chainId of chainsToFetch) {
      const provider = this.#getProvider(chainId);

      if (!provider) {
        log('No provider available for chain', { chainId });
        continue;
      }

      const assetId = buildNativeAssetId(chainId);

      // Fetch balance for each account
      for (const account of request.accounts) {
        const { address, id: accountId } = account;

        try {
          const balancePromise = provider.getBalance(address);
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('RPC timeout')), this.#timeout),
          );

          const balance = await Promise.race([balancePromise, timeoutPromise]);

          if (!assetsBalance[accountId]) {
            assetsBalance[accountId] = {};
          }

          assetsBalance[accountId][assetId] = {
            amount: balance.toString(),
          };
        } catch (error) {
          log('Failed to fetch balance', { address, chainId, error });

          if (!assetsBalance[accountId]) {
            assetsBalance[accountId] = {};
          }
          assetsBalance[accountId][assetId] = { amount: '0' };

          if (!failedChains.includes(chainId)) {
            failedChains.push(chainId);
          }
        }
      }
    }

    // Log detailed balance information
    for (const [accountId, balances] of Object.entries(assetsBalance)) {
      const balanceDetails = Object.entries(balances).map(
        ([assetId, balance]) => ({
          assetId,
          amount: balance.amount,
        }),
      );
      log('Fetch result - account balances', {
        accountId,
        balances: balanceDetails,
      });
    }

    if (failedChains.length > 0) {
      log('Fetch PARTIAL - some chains failed', {
        successChains: chainsToFetch.filter((c) => !failedChains.includes(c)),
        failedChains,
        accountCount: Object.keys(assetsBalance).length,
      });

      // Add failed chains to errors so they can fallback to other data sources
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

    return response;
  }

  // ============================================================================
  // MIDDLEWARE
  // ============================================================================

  /**
   * Get the middleware for fetching balances via RPC.
   * This middleware:
   * - Filters request to only chains this data source supports
   * - Fetches balances for those chains
   * - Merges response into context
   * - Removes handled chains from request for next middleware
   */
  get assetsMiddleware(): Middleware {
    return async (context, next) => {
      const { request } = context;

      // Filter to chains this data source supports
      const supportedChains = request.chainIds.filter((chainId) =>
        this.state.activeChains.includes(chainId),
      );

      // If no supported chains, skip and pass to next middleware
      if (supportedChains.length === 0) {
        return next(context);
      }

      let successfullyHandledChains: ChainId[] = [];

      log('Middleware fetching', {
        chains: supportedChains,
        accounts: request.accounts.map((a) => a.id),
      });

      try {
        // Fetch for supported chains
        const response = await this.fetch({
          ...request,
          chainIds: supportedChains,
        });

        // Merge response into context
        if (response.assetsBalance) {
          if (!context.response.assetsBalance) {
            context.response.assetsBalance = {};
          }
          for (const [accountId, accountBalances] of Object.entries(
            response.assetsBalance,
          )) {
            if (!context.response.assetsBalance[accountId]) {
              context.response.assetsBalance[accountId] = {};
            }
            context.response.assetsBalance[accountId] = {
              ...context.response.assetsBalance[accountId],
              ...accountBalances,
            };
          }
        }

        // Determine successfully handled chains (exclude errors)
        const failedChains = new Set(Object.keys(response.errors ?? {}));
        successfullyHandledChains = supportedChains.filter(
          (chainId) => !failedChains.has(chainId),
        );
      } catch (error) {
        log('Middleware fetch failed', { error });
        successfullyHandledChains = [];
      }

      // Remove successfully handled chains from request for next middleware
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

      // No chains handled - pass context unchanged
      return next(context);
    };
  }

  // ============================================================================
  // SUBSCRIBE
  // ============================================================================

  async subscribe(subscriptionRequest: SubscriptionRequest): Promise<void> {
    const { request, subscriptionId, isUpdate } = subscriptionRequest;

    // Filter to active chains
    const chainsToSubscribe = request.chainIds.filter((chainId) =>
      this.state.activeChains.includes(chainId),
    );

    log('Subscribe requested', {
      subscriptionId,
      isUpdate,
      accounts: request.accounts.map((a) => a.id),
      requestedChains: request.chainIds,
      chainsToSubscribe,
    });

    if (chainsToSubscribe.length === 0) {
      log('No active chains to subscribe');
      return;
    }

    // Handle subscription update
    if (isUpdate) {
      const existing = this.activeSubscriptions.get(subscriptionId);
      if (existing) {
        log('Updating existing subscription', {
          subscriptionId,
          chainsToSubscribe,
        });
        existing.chains = chainsToSubscribe;
        return;
      }
    }

    // Clean up existing subscription
    await this.unsubscribe(subscriptionId);

    const pollInterval = request.updateInterval ?? this.#pollInterval;
    log('Setting up polling subscription', { subscriptionId, pollInterval });

    // Create poll function
    const pollFn = async () => {
      try {
        const subscription = this.activeSubscriptions.get(subscriptionId);
        if (!subscription) {
          return;
        }

        const fetchResponse = await this.fetch({
          ...request,
          chainIds: subscription.chains,
        });

        // Report update to AssetsController
        this.#messenger.call(
          'AssetsController:assetsUpdate',
          fetchResponse,
          CONTROLLER_NAME,
        );
      } catch (error) {
        log('Subscription poll failed', { subscriptionId, error });
      }
    };

    // Set up polling
    const timer = setInterval(pollFn, pollInterval);

    // Store subscription
    this.activeSubscriptions.set(subscriptionId, {
      cleanup: () => {
        log('Cleaning up subscription', { subscriptionId });
        clearInterval(timer);
      },
      chains: chainsToSubscribe,
    });

    log('Subscription SUCCESS', { subscriptionId, chains: chainsToSubscribe });

    // Initial fetch
    await pollFn();
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Creates an RpcDataSource instance.
 */
export function createRpcDataSource(
  options: RpcDataSourceOptions,
): RpcDataSource {
  return new RpcDataSource(options);
}
