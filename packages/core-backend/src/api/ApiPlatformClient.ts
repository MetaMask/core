/**
 * ApiPlatformClient - MetaMask API Platform Client
 *
 * A comprehensive API client that uses @tanstack/query-core directly for:
 * - Automatic request deduplication
 * - Intelligent caching
 * - Automatic retries with exponential backoff
 *
 * Provides unified access to all MetaMask backend APIs:
 * - Accounts API (accounts.api.cx.metamask.io)
 * - Price API (price.api.cx.metamask.io)
 * - Token API (token.api.cx.metamask.io)
 * - Tokens API (tokens.api.cx.metamask.io)
 *
 * @example
 * ```typescript
 * const client = new ApiPlatformClient({
 *   clientProduct: 'metamask-extension',
 *   getBearerToken: async () => token,
 * });
 *
 * // Access API methods through sub-clients
 * const networks = await client.accounts.fetchV2SupportedNetworks();
 * const balances = await client.accounts.fetchV5MultiAccountBalances(accountIds);
 * const prices = await client.prices.fetchV3SpotPrices(assetIds);
 * const tokenList = await client.token.fetchTokenList(1);
 * const assets = await client.tokens.fetchV3Assets(assetIds);
 *
 * // Cache management
 * await client.invalidateAll();           // Invalidate all caches
 * await client.invalidateAuthToken();     // Invalidate auth token
 * await client.accounts.invalidateBalances(); // Domain-specific via sub-client
 * await client.prices.invalidatePrices();     // Domain-specific via sub-client
 * ```
 */

import { QueryClient } from '@tanstack/query-core';
import type { QueryKey } from '@tanstack/query-core';

// Import API clients from subfolders
import { AccountsApiClient } from './accounts';
import { PricesApiClient } from './prices';
import {
  STALE_TIMES,
  GC_TIMES,
  authQueryKeys,
  shouldRetry,
  calculateRetryDelay,
} from './shared-types';
import type { ApiPlatformClientOptions } from './shared-types';
import { TokenApiClient } from './token';
import { TokensApiClient } from './tokens';

// ============================================================================
// UNIFIED API CLIENT
// ============================================================================

/**
 * MetaMask API Platform Client with TanStack Query caching.
 * Provides cached access to all MetaMask backend APIs through a unified interface.
 *
 * Access API methods through the sub-clients:
 * - `client.accounts` - Accounts API (balances, transactions, NFTs, etc.)
 * - `client.prices` - Prices API (spot prices, exchange rates, historical prices)
 * - `client.token` - Token API (token metadata, trending, top gainers)
 * - `client.tokens` - Tokens API (bulk asset operations, supported networks)
 */
export class ApiPlatformClient {
  /**
   * Accounts API client.
   * Provides methods for balances, transactions, relationships, NFTs, and token discovery.
   */
  readonly accounts: AccountsApiClient;

  /**
   * Prices API client.
   * Provides methods for spot prices, exchange rates, and historical prices.
   */
  readonly prices: PricesApiClient;

  /**
   * Token API client.
   * Provides methods for token metadata, networks, trending tokens, and top assets.
   */
  readonly token: TokenApiClient;

  /**
   * Tokens API client.
   * Provides methods for bulk asset operations and supported networks.
   */
  readonly tokens: TokensApiClient;

  /**
   * Shared QueryClient instance used by all sub-clients.
   */
  readonly #sharedQueryClient: QueryClient;

  constructor(options: ApiPlatformClientOptions) {
    // Create or use provided QueryClient - shared by all sub-clients
    this.#sharedQueryClient =
      options.queryClient ??
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: STALE_TIMES.DEFAULT,
            gcTime: GC_TIMES.DEFAULT,
            retry: shouldRetry,
            retryDelay: calculateRetryDelay,
            refetchOnWindowFocus: false,
            networkMode: 'always',
          },
        },
      });

    // Pass the shared QueryClient to all sub-clients
    const sharedOptions: ApiPlatformClientOptions = {
      ...options,
      queryClient: this.#sharedQueryClient,
    };

    this.accounts = new AccountsApiClient(sharedOptions);
    this.prices = new PricesApiClient(sharedOptions);
    this.token = new TokenApiClient(sharedOptions);
    this.tokens = new TokensApiClient(sharedOptions);
  }

  // ==========================================================================
  // CACHE MANAGEMENT (operates on shared QueryClient)
  // ==========================================================================

  /**
   * Get the underlying QueryClient (for advanced usage).
   *
   * @returns The underlying QueryClient instance.
   */
  get queryClient(): QueryClient {
    return this.#sharedQueryClient;
  }

  /**
   * Get cached data for a query key.
   *
   * @param queryKey - The query key to look up.
   * @returns The cached data or undefined.
   */
  getCachedData<CachedData>(queryKey: QueryKey): CachedData | undefined {
    return this.#sharedQueryClient.getQueryData<CachedData>(queryKey);
  }

  /**
   * Set cached data for a query key.
   *
   * @param queryKey - The query key to set data for.
   * @param data - The data to cache.
   */
  setCachedData<CachedData>(queryKey: QueryKey, data: CachedData): void {
    this.#sharedQueryClient.setQueryData(queryKey, data);
  }

  /**
   * Check if a query is currently fetching.
   *
   * @param queryKey - The query key to check.
   * @returns True if the query is currently fetching.
   */
  isFetching(queryKey: QueryKey): boolean {
    return this.#sharedQueryClient.isFetching({ queryKey }) > 0;
  }

  /**
   * Clear all cached data across all sub-clients.
   */
  clear(): void {
    this.#sharedQueryClient.clear();
  }

  /**
   * Invalidate all queries across all sub-clients.
   */
  async invalidateAll(): Promise<void> {
    await this.#sharedQueryClient.invalidateQueries();
  }

  /**
   * Invalidate the cached auth token.
   * Call this when the user logs out or the token expires.
   */
  async invalidateAuthToken(): Promise<void> {
    await this.#sharedQueryClient.invalidateQueries({
      queryKey: authQueryKeys.bearerToken(),
    });
  }
}

/**
 * Factory function to create an ApiPlatformClient.
 *
 * @param options - Configuration options for the client.
 * @returns A new ApiPlatformClient instance.
 */
export function createApiPlatformClient(
  options: ApiPlatformClientOptions,
): ApiPlatformClient {
  return new ApiPlatformClient(options);
}
