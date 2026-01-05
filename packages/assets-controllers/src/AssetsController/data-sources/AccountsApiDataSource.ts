import { toChecksumAddress } from '@ethereumjs/util';
import type { V5BalancesResponse, V5BalanceItem } from '@metamask/core-backend';
import { ApiPlatformClient } from '@metamask/core-backend';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { Messenger } from '@metamask/messenger';
import { parseCaipAssetType, parseCaipChainId } from '@metamask/utils';

import { AbstractDataSource } from './AbstractDataSource';
import type {
  DataSourceState,
  SubscriptionRequest,
} from './AbstractDataSource';
import { projectLogger, createModuleLogger } from '../../logger';
import type {
  ChainId,
  Caip19AssetId,
  AssetBalance,
  DataRequest,
  DataResponse,
  Middleware,
} from '../types';

// ============================================================================
// CONSTANTS
// ============================================================================

const CONTROLLER_NAME = 'AccountsApiDataSource';
const DEFAULT_POLL_INTERVAL = 30_000;

const log = createModuleLogger(projectLogger, CONTROLLER_NAME);

// ============================================================================
// MESSENGER TYPES
// ============================================================================

// Action types that AccountsApiDataSource exposes
export type AccountsApiDataSourceGetAssetsMiddlewareAction = {
  type: 'AccountsApiDataSource:getAssetsMiddleware';
  handler: () => Middleware;
};

export type AccountsApiDataSourceGetActiveChainsAction = {
  type: 'AccountsApiDataSource:getActiveChains';
  handler: () => Promise<ChainId[]>;
};

export type AccountsApiDataSourceFetchAction = {
  type: 'AccountsApiDataSource:fetch';
  handler: (request: DataRequest) => Promise<DataResponse>;
};

export type AccountsApiDataSourceSubscribeAction = {
  type: 'AccountsApiDataSource:subscribe';
  handler: (request: SubscriptionRequest) => Promise<void>;
};

export type AccountsApiDataSourceUnsubscribeAction = {
  type: 'AccountsApiDataSource:unsubscribe';
  handler: (subscriptionId: string) => Promise<void>;
};

export type AccountsApiDataSourceActions =
  | AccountsApiDataSourceGetAssetsMiddlewareAction
  | AccountsApiDataSourceGetActiveChainsAction
  | AccountsApiDataSourceFetchAction
  | AccountsApiDataSourceSubscribeAction
  | AccountsApiDataSourceUnsubscribeAction;

// Event types that AccountsApiDataSource publishes
export type AccountsApiDataSourceActiveChainsChangedEvent = {
  type: 'AccountsApiDataSource:activeChainsUpdated';
  payload: [ChainId[]];
};

export type AccountsApiDataSourceAssetsUpdatedEvent = {
  type: 'AccountsApiDataSource:assetsUpdated';
  payload: [DataResponse, string | undefined];
};

export type AccountsApiDataSourceEvents =
  | AccountsApiDataSourceActiveChainsChangedEvent
  | AccountsApiDataSourceAssetsUpdatedEvent;

// Actions to report to AssetsController
type AssetsControllerActiveChainsUpdateAction = {
  type: 'AssetsController:activeChainsUpdate';
  handler: (dataSourceId: string, activeChains: ChainId[]) => void;
};

type AssetsControllerAssetsUpdateAction = {
  type: 'AssetsController:assetsUpdate';
  handler: (response: DataResponse, sourceId: string) => Promise<void>;
};

// Allowed actions that AccountsApiDataSource can call
// Note: Uses ApiPlatformClient directly, so no BackendApiClient actions needed
export type AccountsApiDataSourceAllowedActions =
  | AssetsControllerActiveChainsUpdateAction
  | AssetsControllerAssetsUpdateAction;

export type AccountsApiDataSourceMessenger = Messenger<
  typeof CONTROLLER_NAME,
  AccountsApiDataSourceActions | AccountsApiDataSourceAllowedActions,
  AccountsApiDataSourceEvents
>;

// ============================================================================
// STATE
// ============================================================================

export type AccountsApiDataSourceState = DataSourceState;

const defaultState: AccountsApiDataSourceState = {
  activeChains: [],
};

// ============================================================================
// OPTIONS
// ============================================================================

export type AccountsApiDataSourceOptions = {
  messenger: AccountsApiDataSourceMessenger;
  /** ApiPlatformClient for API calls with caching */
  queryApiClient: ApiPlatformClient;
  pollInterval?: number;
  state?: Partial<AccountsApiDataSourceState>;
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function decimalToChainId(decimalChainId: number | string): ChainId {
  // Handle both decimal numbers and already-formatted CAIP chain IDs
  if (typeof decimalChainId === 'string') {
    // If already a CAIP chain ID (e.g., "eip155:1"), return as-is
    if (decimalChainId.startsWith('eip155:')) {
      return decimalChainId as ChainId;
    }
    // If it's a string number, convert
    return `eip155:${decimalChainId}` as ChainId;
  }
  return `eip155:${decimalChainId}` as ChainId;
}

/**
 * Convert a CAIP-2 chain ID from the API response to our ChainId type.
 * Handles both formats: "eip155:1" or just "1" (decimal).
 *
 * @param chainIdStr
 */
function caipChainIdToChainId(chainIdStr: string): ChainId {
  // If already in CAIP-2 format, return as-is
  if (chainIdStr.includes(':')) {
    return chainIdStr as ChainId;
  }
  // If decimal number, convert to CAIP-2
  return `eip155:${chainIdStr}` as ChainId;
}

/**
 * Normalizes a CAIP-19 asset ID by checksumming EVM addresses.
 * This ensures consistent asset IDs regardless of the data source format.
 *
 * For EVM ERC20 tokens (e.g., "eip155:1/erc20:0x..."), the address is checksummed.
 * All other asset types are returned unchanged.
 *
 * @param assetId - The CAIP-19 asset ID to normalize
 * @returns The normalized asset ID with checksummed address (for EVM tokens)
 */
function normalizeAssetId(assetId: Caip19AssetId): Caip19AssetId {
  const parsed = parseCaipAssetType(assetId);
  const chainIdParsed = parseCaipChainId(parsed.chainId);

  // Only checksum EVM ERC20 addresses
  if (
    chainIdParsed.namespace === 'eip155' &&
    parsed.assetNamespace === 'erc20'
  ) {
    const checksummedAddress = toChecksumAddress(parsed.assetReference);
    return `${parsed.chainId}/${parsed.assetNamespace}:${checksummedAddress}` as Caip19AssetId;
  }

  return assetId;
}

// ============================================================================
// ACCOUNTS API DATA SOURCE
// ============================================================================

/**
 * Data source for fetching balances from the MetaMask Accounts API.
 *
 * Uses Messenger pattern for all interactions:
 * - Calls BackendApiClient methods via messenger actions
 * - Exposes its own actions for AssetsController to call
 * - Publishes events for AssetsController to subscribe to
 *
 * Actions exposed:
 * - AccountsApiDataSource:getActiveChains
 * - AccountsApiDataSource:fetch
 * - AccountsApiDataSource:subscribe
 * - AccountsApiDataSource:unsubscribe
 *
 * Events published:
 * - AccountsApiDataSource:activeChainsUpdated
 * - AccountsApiDataSource:assetsUpdated
 *
 * Actions called (from BackendApiClient):
 * - BackendApiClient:Accounts:getV2SupportedNetworks
 * - BackendApiClient:Accounts:getV5MultiAccountBalances
 */
export class AccountsApiDataSource extends AbstractDataSource<
  typeof CONTROLLER_NAME,
  AccountsApiDataSourceState
> {
  readonly #messenger: AccountsApiDataSourceMessenger;

  readonly #pollInterval: number;

  /** ApiPlatformClient for cached API calls */
  readonly #apiClient: ApiPlatformClient;

  /** WebSocket connection for real-time updates */
  readonly #websocket: WebSocket | null = null;

  /** Chains refresh timer */
  #chainsRefreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: AccountsApiDataSourceOptions) {
    super(CONTROLLER_NAME, {
      ...defaultState,
      ...options.state,
    });

    this.#messenger = options.messenger;
    this.#pollInterval = options.pollInterval ?? DEFAULT_POLL_INTERVAL;
    this.#apiClient = options.queryApiClient;

    this.#registerActionHandlers();
    this.#initializeActiveChains();
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  #registerActionHandlers(): void {
    // Define strongly-typed handlers
    const getAssetsMiddlewareHandler: AccountsApiDataSourceGetAssetsMiddlewareAction['handler'] =
      () => this.assetsMiddleware;

    const getActiveChainsHandler: AccountsApiDataSourceGetActiveChainsAction['handler'] =
      async () => this.getActiveChains();

    const fetchHandler: AccountsApiDataSourceFetchAction['handler'] = async (
      request,
    ) => this.fetch(request);

    const subscribeHandler: AccountsApiDataSourceSubscribeAction['handler'] =
      async (request) => this.subscribe(request);

    const unsubscribeHandler: AccountsApiDataSourceUnsubscribeAction['handler'] =
      async (subscriptionId) => this.unsubscribe(subscriptionId);

    // Register handlers
    this.#messenger.registerActionHandler(
      'AccountsApiDataSource:getAssetsMiddleware',
      getAssetsMiddlewareHandler,
    );

    this.#messenger.registerActionHandler(
      'AccountsApiDataSource:getActiveChains',
      getActiveChainsHandler,
    );

    this.#messenger.registerActionHandler(
      'AccountsApiDataSource:fetch',
      fetchHandler,
    );

    this.#messenger.registerActionHandler(
      'AccountsApiDataSource:subscribe',
      subscribeHandler,
    );

    this.#messenger.registerActionHandler(
      'AccountsApiDataSource:unsubscribe',
      unsubscribeHandler,
    );
  }

  async #initializeActiveChains(): Promise<void> {
    try {
      const chains = await this.#fetchActiveChains();
      this.updateActiveChains(chains, (c) => {
        this.#messenger.call(
          'AssetsController:activeChainsUpdate',
          CONTROLLER_NAME,
          c,
        );
        // Also publish event for BackendWebsocketDataSource to sync
        this.#messenger.publish('AccountsApiDataSource:activeChainsUpdated', c);
      });

      // Periodically refresh active chains (every 20 minutes)
      this.#chainsRefreshTimer = setInterval(
        () => this.#refreshActiveChains(),
        20 * 60 * 1000,
      );
    } catch (error) {
      log('Failed to fetch active chains', error);
    }
  }

  async #refreshActiveChains(): Promise<void> {
    try {
      const chains = await this.#fetchActiveChains();
      const previousChains = new Set(this.state.activeChains);
      const newChains = new Set(chains);

      // Check if chains changed
      const added = chains.filter((c) => !previousChains.has(c));
      const removed = Array.from(previousChains).filter(
        (c) => !newChains.has(c),
      );

      if (added.length > 0 || removed.length > 0) {
        this.updateActiveChains(chains, (c) => {
          this.#messenger.call(
            'AssetsController:activeChainsUpdate',
            CONTROLLER_NAME,
            c,
          );
          // Also publish event for BackendWebsocketDataSource to sync
          this.#messenger.publish(
            'AccountsApiDataSource:activeChainsUpdated',
            c,
          );
        });
      }
    } catch (error) {
      log('Failed to refresh active chains', error);
    }
  }

  async #fetchActiveChains(): Promise<ChainId[]> {
    const response = await this.#apiClient.fetchV2SupportedNetworks();

    // Use fullSupport networks as active chains
    return response.fullSupport.map(decimalToChainId);
  }

  // ============================================================================
  // ACCOUNT SCOPE HELPERS
  // ============================================================================

  /**
   * Check if an account supports a specific chain based on its scopes.
   * AccountsApiDataSource only handles EVM chains, so we check for EIP155 scopes.
   *
   * @param account - The account to check
   * @param chainId - The chain ID to check (e.g., "eip155:1")
   * @returns True if the account supports the chain
   */
  #accountSupportsChain(account: InternalAccount, chainId: ChainId): boolean {
    const scopes = account.scopes ?? [];

    // If no scopes defined, assume it supports the chain (backward compatibility)
    if (scopes.length === 0) {
      return true;
    }

    // Extract namespace and reference from chainId (e.g., "eip155:1" -> ["eip155", "1"])
    const [chainNamespace, chainReference] = chainId.split(':');

    for (const scope of scopes) {
      const [scopeNamespace, scopeReference] = (scope as string).split(':');

      // Check if namespaces match
      if (scopeNamespace !== chainNamespace) {
        continue;
      }

      // Wildcard scope (e.g., "eip155:0" means all chains in that namespace)
      if (scopeReference === '0') {
        return true;
      }

      // Exact match check - normalize hex to decimal for EIP155
      if (chainNamespace === 'eip155') {
        const normalizedScopeRef = scopeReference?.startsWith('0x')
          ? parseInt(scopeReference, 16).toString()
          : scopeReference;
        if (normalizedScopeRef === chainReference) {
          return true;
        }
      } else if (scopeReference === chainReference) {
        return true;
      }
    }

    return false;
  }

  // ============================================================================
  // FETCH
  // ============================================================================

  async fetch(request: DataRequest): Promise<DataResponse> {
    const response: DataResponse = {};

    // Filter to only chains supported by Accounts API
    const supportedChains = new Set(this.state.activeChains);
    const chainsToFetch = request.chainIds.filter((chainId) =>
      supportedChains.has(chainId),
    );

    if (chainsToFetch.length === 0) {
      // Mark unsupported chains as errors so they pass to next middleware
      for (const chainId of request.chainIds) {
        if (!supportedChains.has(chainId)) {
          response.errors = response.errors ?? {};
          response.errors[chainId] = 'Chain not supported by Accounts API';
        }
      }
      return response;
    }

    try {
      // Build CAIP-10 account IDs (e.g., "eip155:1:0x1234...")
      // Only include account-chain combinations where the account's scopes
      // overlap with the chains being fetched
      const accountIds = request.accounts.flatMap((account) =>
        chainsToFetch
          .filter((chainId) => this.#accountSupportsChain(account, chainId))
          .map((chainId) => `${chainId}:${account.address}`),
      );

      // Skip API call if no valid account-chain combinations
      if (accountIds.length === 0) {
        return response;
      }

      const apiResponse =
        await this.#apiClient.fetchV5MultiAccountBalances(accountIds);

      // Handle unprocessed networks - these will be passed to next middleware
      if (apiResponse.unprocessedNetworks.length > 0) {
        const unprocessedChainIds =
          apiResponse.unprocessedNetworks.map(caipChainIdToChainId);

        // Add unprocessed chains to errors so middleware passes them to next data source
        response.errors = response.errors ?? {};
        for (const chainId of unprocessedChainIds) {
          response.errors[chainId] = 'Unprocessed by Accounts API';
        }
      }

      const { assetsBalance } = this.#processV5Balances(
        apiResponse.balances,
        request,
      );

      response.assetsBalance = assetsBalance;
    } catch (error) {
      log('Fetch FAILED', { error, chains: chainsToFetch });

      // On error, mark all chains as errors so they can be handled by next middleware
      response.errors = response.errors ?? {};
      for (const chainId of chainsToFetch) {
        response.errors[chainId] =
          `Fetch failed: ${error instanceof Error ? error.message : String(error)}`;
      }
    }

    // Mark unsupported chains as errors so they pass to next middleware
    for (const chainId of request.chainIds) {
      if (!supportedChains.has(chainId)) {
        response.errors = response.errors ?? {};
        response.errors[chainId] = 'Chain not supported by Accounts API';
      }
    }

    return response;
  }

  /**
   * Process V5 API balances response.
   * V5 returns a flat array of balance items, each with accountId and assetId.
   *
   * @param balances
   * @param request
   */
  #processV5Balances(
    balances: V5BalanceItem[],
    request: DataRequest,
  ): {
    assetsBalance: Record<string, Record<Caip19AssetId, AssetBalance>>;
  } {
    const assetsBalance: Record<
      string,
      Record<Caip19AssetId, AssetBalance>
    > = {};

    // Build a map of lowercase addresses to account IDs for efficient lookup
    const addressToAccountId = new Map<string, string>();
    for (const account of request.accounts) {
      if (account.address) {
        addressToAccountId.set(account.address.toLowerCase(), account.id);
      }
    }

    // V5 response: array of { accountId, assetId, balance, ... }
    for (const item of balances) {
      // Extract address from CAIP-10 account ID (e.g., "eip155:1:0x1234..." -> "0x1234...")
      const addressParts = item.accountId.split(':');
      if (addressParts.length < 3) {
        continue;
      }
      const address = addressParts[2].toLowerCase();

      // Find the matching account ID from request
      const accountId = addressToAccountId.get(address);
      if (!accountId) {
        // This is normal - API returns balances for all chains, but request may only have one account
        continue;
      }

      if (!assetsBalance[accountId]) {
        assetsBalance[accountId] = {};
      }

      // Normalize asset ID (checksum EVM addresses for ERC20 tokens)
      const normalizedAssetId = normalizeAssetId(item.assetId as Caip19AssetId);

      // Store balance as returned by API
      assetsBalance[accountId][normalizedAssetId] = {
        amount: item.balance,
      };
    }

    return { assetsBalance };
  }

  // ============================================================================
  // MIDDLEWARE
  // ============================================================================

  /**
   * Get the middleware for fetching balances via Accounts API.
   * This middleware:
   * - Supports multiple accounts in a single request
   * - Uses unprocessedNetworks from API response to determine what to pass to next middleware
   * - Merges response into context
   * - Removes handled chains from request for next middleware
   */
  get assetsMiddleware(): Middleware {
    return async (context, next) => {
      const { request } = context;

      // If no chains requested, skip to next middleware
      if (request.chainIds.length === 0) {
        return next(context);
      }

      let successfullyHandledChains: ChainId[] = [];

      try {
        const response = await this.fetch(request);

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

        // Determine successfully handled chains (exclude unprocessed/error chains)
        const unprocessedChains = new Set(Object.keys(response.errors ?? {}));
        successfullyHandledChains = request.chainIds.filter(
          (chainId) => !unprocessedChains.has(chainId),
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

    // Try all requested chains - API will handle unsupported ones via unprocessedNetworks
    const chainsToSubscribe = request.chainIds;

    if (chainsToSubscribe.length === 0) {
      return;
    }

    // Handle subscription update
    if (isUpdate) {
      const existing = this.activeSubscriptions.get(subscriptionId);
      if (existing) {
        existing.chains = chainsToSubscribe;
        return;
      }
    }

    // Clean up existing subscription if any
    await this.unsubscribe(subscriptionId);

    const pollInterval = request.updateInterval ?? this.#pollInterval;

    // Create poll function for this subscription
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
        clearInterval(timer);
      },
      chains: chainsToSubscribe,
    });

    // Initial fetch
    await pollFn();
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  destroy(): void {
    // Clean up timers
    if (this.#chainsRefreshTimer) {
      clearInterval(this.#chainsRefreshTimer);
    }

    // Clean up WebSocket
    if (this.#websocket) {
      this.#websocket.close();
    }

    // Clean up subscriptions
    super.destroy();
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Creates an AccountsApiDataSource instance.
 *
 * @param options
 */
export function createAccountsApiDataSource(
  options: AccountsApiDataSourceOptions,
): AccountsApiDataSource {
  return new AccountsApiDataSource(options);
}
