import type { V5BalanceItem } from '@metamask/core-backend';
import { ApiPlatformClient } from '@metamask/core-backend';
import {
  isCaipChainId,
  KnownCaipNamespace,
  toCaipChainId,
} from '@metamask/utils';

import type {
  DataSourceState,
  SubscriptionRequest,
} from './AbstractDataSource';
import { AbstractDataSource } from './AbstractDataSource';
import { projectLogger, createModuleLogger } from '../logger';
import type {
  ChainId,
  Caip19AssetId,
  AssetBalance,
  DataRequest,
  DataResponse,
  Middleware,
  AssetsControllerStateInternal,
} from '../types';
import { normalizeAssetId } from '../utils';

// ============================================================================
// CONSTANTS
// ============================================================================

const CONTROLLER_NAME = 'AccountsApiDataSource';
const DEFAULT_POLL_INTERVAL = 30_000;

const log = createModuleLogger(projectLogger, CONTROLLER_NAME);

// ============================================================================
// MESSENGER TYPES
// ============================================================================

// Allowed actions that AccountsApiDataSource can call (none - uses callbacks).
// Note: Uses ApiPlatformClient directly, so no BackendApiClient actions needed
export type AccountsApiDataSourceAllowedActions = never;

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

/** Optional configuration for AccountsApiDataSource. */
export type AccountsApiDataSourceConfig = {
  /** Polling interval in ms (default: 30000) */
  pollInterval?: number;
  /**
   * Function returning whether token detection is enabled (default: () => true).
   * When it returns false, balances are only returned for tokens already in state.
   * Using a getter avoids stale values when the user toggles the preference at runtime.
   */
  tokenDetectionEnabled?: () => boolean;
};

export type AccountsApiDataSourceOptions = AccountsApiDataSourceConfig & {
  /** ApiPlatformClient for API calls with caching */
  queryApiClient: ApiPlatformClient;
  /** Called when active chains are updated. Pass dataSourceName so the controller knows the source. */
  onActiveChainsUpdated: (
    dataSourceName: string,
    chains: ChainId[],
    previousChains: ChainId[],
  ) => void;
  state?: Partial<AccountsApiDataSourceState>;
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function decimalToChainId(decimalChainId: number | string): ChainId {
  // Handle both decimal numbers and already-formatted CAIP chain IDs
  if (typeof decimalChainId === 'string') {
    if (isCaipChainId(decimalChainId)) {
      return decimalChainId;
    }
    return toCaipChainId(KnownCaipNamespace.Eip155, decimalChainId);
  }
  return toCaipChainId(KnownCaipNamespace.Eip155, String(decimalChainId));
}

/**
 * Convert a CAIP-2 chain ID from the API response to our ChainId type.
 * Handles both formats: "eip155:1" or just "1" (decimal).
 * Uses @metamask/utils for CAIP parsing.
 *
 * @param chainIdStr - The chain ID string to convert.
 * @returns The normalized ChainId.
 */
function caipChainIdToChainId(chainIdStr: string): ChainId {
  if (isCaipChainId(chainIdStr)) {
    return chainIdStr;
  }
  return toCaipChainId(KnownCaipNamespace.Eip155, chainIdStr);
}

/**
 * Filter a response to only include balances for assets already in state.
 * Used when tokenDetectionEnabled is false to prevent adding new tokens.
 *
 * @param response - The fetch response to filter.
 * @param assetsState - Current assets controller state to check existing balances against.
 * @returns A new response with only known asset balances.
 */
export function filterResponseToKnownAssets(
  response: DataResponse,
  assetsState: AssetsControllerStateInternal,
): DataResponse {
  if (!response.assetsBalance) {
    return response;
  }

  const filteredBalance: Record<
    string,
    Record<Caip19AssetId, AssetBalance>
  > = {};

  for (const [accountId, accountBalances] of Object.entries(
    response.assetsBalance,
  )) {
    const existingBalances = assetsState.assetsBalance[accountId];
    if (!existingBalances) {
      // Account has no balances in state yet — skip all its tokens
      continue;
    }

    const filtered: Record<Caip19AssetId, AssetBalance> = {};
    for (const [assetId, balance] of Object.entries(accountBalances)) {
      // Only include assets already tracked in state
      if (assetId in existingBalances) {
        filtered[assetId as Caip19AssetId] = balance;
      }
    }

    if (Object.keys(filtered).length > 0) {
      filteredBalance[accountId] = filtered;
    }
  }

  return {
    ...response,
    assetsBalance:
      Object.keys(filteredBalance).length > 0 ? filteredBalance : undefined,
  };
}

// ============================================================================
// ACCOUNTS API DATA SOURCE
// ============================================================================

/**
 * Data source for fetching balances from the MetaMask Accounts API.
 *
 * Uses ApiPlatformClient (queryApiClient) for all API calls. Does not use the
 * messenger. Reports active chains via onActiveChainsUpdated callback.
 */
export class AccountsApiDataSource extends AbstractDataSource<
  typeof CONTROLLER_NAME,
  AccountsApiDataSourceState
> {
  readonly #onActiveChainsUpdated: (
    dataSourceName: string,
    chains: ChainId[],
    previousChains: ChainId[],
  ) => void;

  readonly #pollInterval: number;

  /** Getter avoids stale value when user toggles token detection at runtime. */
  readonly #tokenDetectionEnabled: () => boolean;

  /** ApiPlatformClient for cached API calls */
  readonly #apiClient: ApiPlatformClient;

  /** Chains refresh timer */
  #chainsRefreshTimer: ReturnType<typeof setInterval> | null = null;

  /** State accessor from subscriptions (for filtering when tokenDetectionEnabled is false) */
  #getAssetsState?: () => AssetsControllerStateInternal;

  constructor(options: AccountsApiDataSourceOptions) {
    super(CONTROLLER_NAME, {
      ...defaultState,
      ...options.state,
    });

    this.#onActiveChainsUpdated = options.onActiveChainsUpdated;
    this.#pollInterval = options.pollInterval ?? DEFAULT_POLL_INTERVAL;
    this.#tokenDetectionEnabled =
      options.tokenDetectionEnabled ?? ((): boolean => true);
    this.#apiClient = options.queryApiClient;

    this.#initializeActiveChains().catch(console.error);
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  async #initializeActiveChains(): Promise<void> {
    try {
      const chains = await this.#fetchActiveChains();
      const previous = [...this.state.activeChains];
      this.updateActiveChains(chains, (updatedChains) =>
        this.#onActiveChainsUpdated(this.getName(), updatedChains, previous),
      );

      // Periodically refresh active chains (every 20 minutes)
      this.#chainsRefreshTimer = setInterval(
        () => {
          this.#refreshActiveChains().catch(console.error);
        },
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
      const added = chains.filter((chain) => !previousChains.has(chain));
      const removed = Array.from(previousChains).filter(
        (chain) => !newChains.has(chain),
      );

      if (added.length > 0 || removed.length > 0) {
        const previous = [...this.state.activeChains];
        this.updateActiveChains(chains, (updatedChains) =>
          this.#onActiveChainsUpdated(this.getName(), updatedChains, previous),
        );
      }
    } catch (error) {
      log('Failed to refresh active chains', error);
    }
  }

  async #fetchActiveChains(): Promise<ChainId[]> {
    const response = await this.#apiClient.accounts.fetchV2SupportedNetworks();

    // Use fullSupport networks as active chains
    return response.fullSupport.map(decimalToChainId);
  }

  // ============================================================================
  // ACCOUNT SCOPE HELPERS
  // ============================================================================

  // ============================================================================
  // FETCH
  // ============================================================================

  async fetch(request: DataRequest): Promise<DataResponse> {
    let response: DataResponse = {};

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
      // Use pre-computed supportedChains per account from the request
      const accountIds = request.accountsWithSupportedChains.flatMap(
        ({ account, supportedChains: accountChains }) =>
          chainsToFetch
            .filter((chainId) => accountChains.includes(chainId))
            .map((chainId) => `${chainId}:${account.address}`),
      );

      // Skip API call if no valid account-chain combinations
      if (accountIds.length === 0) {
        return response;
      }

      const apiResponse =
        await this.#apiClient.accounts.fetchV5MultiAccountBalances(accountIds);

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
      response.updateMode = 'full';
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

    // When token detection is disabled, filter out tokens not already in state
    if (!this.#tokenDetectionEnabled() && this.#getAssetsState) {
      response = filterResponseToKnownAssets(response, this.#getAssetsState());
    }

    return response;
  }

  /**
   * Process V5 API balances response.
   * V5 returns a flat array of balance items, each with accountId and assetId.
   *
   * @param balances - Array of balance items from the V5 API response.
   * @param request - The original data request containing accounts to map.
   * @returns Object containing processed asset balances by account.
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
    for (const { account } of request.accountsWithSupportedChains) {
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
   *
   * @returns The middleware function for the assets pipeline.
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
          context.response.assetsBalance ??= {};
          for (const [accountId, accountBalances] of Object.entries(
            response.assetsBalance,
          )) {
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

        // When token detection is off and we filtered out all balance data (e.g. new
        // account with empty state), do not claim any chain as handled so that RPC
        // middleware can still process them and fetch native balances (ETH, MATIC, etc.).
        if (
          !this.#tokenDetectionEnabled() &&
          (!response.assetsBalance ||
            Object.keys(response.assetsBalance).length === 0)
        ) {
          successfullyHandledChains = [];
        }
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

    // Store state accessor for filtering when tokenDetectionEnabled is false
    if (subscriptionRequest.getAssetsState) {
      this.#getAssetsState = subscriptionRequest.getAssetsState;
    }

    // Try all requested chains - API will handle unsupported ones via unprocessedNetworks
    const chainsToSubscribe = request.chainIds;

    if (chainsToSubscribe.length === 0) {
      return;
    }

    // Handle subscription update - update both chains AND request (for accounts)
    if (isUpdate) {
      const existing = this.activeSubscriptions.get(subscriptionId);
      if (existing) {
        existing.chains = chainsToSubscribe;
        existing.request = request;
        return;
      }
    }

    // Clean up existing subscription if any
    await this.unsubscribe(subscriptionId);

    const pollInterval = request.updateInterval ?? this.#pollInterval;

    // Create poll function for this subscription
    const pollFn = async (): Promise<void> => {
      try {
        const subscription = this.activeSubscriptions.get(subscriptionId);
        if (!subscription?.request) {
          return;
        }

        // Use stored request (which gets updated on account changes)
        const fetchResponse = await this.fetch({
          ...subscription.request,
          chainIds: subscription.chains,
        });

        // Report update to AssetsController via callback
        await subscription.onAssetsUpdate(fetchResponse);
      } catch (error) {
        log('Subscription poll failed', { subscriptionId, error });
      }
    };

    // Set up polling
    const timer = setInterval(() => {
      pollFn().catch(console.error);
    }, pollInterval);

    // Store subscription with request for account updates
    this.activeSubscriptions.set(subscriptionId, {
      cleanup: () => {
        clearInterval(timer);
      },
      chains: chainsToSubscribe,
      request,
      onAssetsUpdate: subscriptionRequest.onAssetsUpdate,
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

    // Clean up subscriptions
    super.destroy();
  }
}
