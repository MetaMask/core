/**
 * Accounts API Client - accounts.api.cx.metamask.io
 *
 * Handles all account-related API calls including:
 * - Supported networks
 * - Active networks
 * - Balances (v2, v4, v5)
 * - Transactions
 * - Relationships
 * - NFTs
 * - Token discovery
 */

import type { QueryFunctionContext } from '@tanstack/query-core';

import type {
  V1SupportedNetworksResponse,
  V2SupportedNetworksResponse,
  V2ActiveNetworksResponse,
  V2BalancesResponse,
  V4BalancesResponse,
  V5BalancesResponse,
  V1TransactionByHashResponse,
  V1AccountTransactionsResponse,
  V4MultiAccountTransactionsResponse,
  V1AccountRelationshipResult,
  V2NftsResponse,
  V2TokensResponse,
} from './types';
import {
  BaseApiClient,
  API_URLS,
  STALE_TIMES,
  GC_TIMES,
  HttpError,
} from '../base-client';
import type { FetchOptions } from '../shared-types';

/**
 * Accounts API Client.
 * Provides methods for interacting with the Accounts API.
 */
export class AccountsApiClient extends BaseApiClient {
  // ==========================================================================
  // CACHE MANAGEMENT
  // ==========================================================================

  /**
   * Invalidate all balance queries.
   */
  async invalidateBalances(): Promise<void> {
    await this.queryClient.invalidateQueries({
      queryKey: ['accounts', 'balances'],
    });
  }

  /**
   * Invalidate all account queries.
   */
  async invalidateAccounts(): Promise<void> {
    await this.queryClient.invalidateQueries({
      queryKey: ['accounts'],
    });
  }

  // ==========================================================================
  // SUPPORTED NETWORKS
  // ==========================================================================

  /**
   * Get list of supported networks (v1 endpoint).
   *
   * @param options - Fetch options including cache settings.
   * @returns The list of supported networks.
   */
  async fetchV1SupportedNetworks(
    options?: FetchOptions,
  ): Promise<V1SupportedNetworksResponse> {
    return this.queryClient.fetchQuery({
      queryKey: ['accounts', 'v1SupportedNetworks'],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<V1SupportedNetworksResponse>(
          API_URLS.ACCOUNTS,
          '/v1/supportedNetworks',
          { signal },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.SUPPORTED_NETWORKS,
      gcTime: options?.gcTime ?? GC_TIMES.EXTENDED,
    });
  }

  /**
   * Get list of supported networks (v2 endpoint).
   *
   * @param options - Fetch options including cache settings.
   * @returns The list of supported networks.
   */
  async fetchV2SupportedNetworks(
    options?: FetchOptions,
  ): Promise<V2SupportedNetworksResponse> {
    return this.queryClient.fetchQuery({
      queryKey: ['accounts', 'v2SupportedNetworks'],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<V2SupportedNetworksResponse>(
          API_URLS.ACCOUNTS,
          '/v2/supportedNetworks',
          { signal },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.SUPPORTED_NETWORKS,
      gcTime: options?.gcTime ?? GC_TIMES.EXTENDED,
    });
  }

  // ==========================================================================
  // ACTIVE NETWORKS
  // ==========================================================================

  /**
   * Get active networks by CAIP-10 account IDs (v2 endpoint).
   *
   * @param accountIds - Array of CAIP-10 account IDs.
   * @param queryOptions - Query filter options.
   * @param queryOptions.filterMMListTokens - Whether to filter MM list tokens.
   * @param queryOptions.networks - Networks to filter by.
   * @param options - Fetch options including cache settings.
   * @returns The active networks response.
   */
  async fetchV2ActiveNetworks(
    accountIds: string[],
    queryOptions?: { filterMMListTokens?: boolean; networks?: string[] },
    options?: FetchOptions,
  ): Promise<V2ActiveNetworksResponse> {
    return this.queryClient.fetchQuery({
      queryKey: [
        'accounts',
        'v2ActiveNetworks',
        {
          accountIds: [...accountIds].sort(),
          options: queryOptions && {
            ...queryOptions,
            networks:
              queryOptions.networks && [...queryOptions.networks].sort(),
          },
        },
      ],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<V2ActiveNetworksResponse>(
          API_URLS.ACCOUNTS,
          '/v2/activeNetworks',
          {
            signal,
            params: {
              accountIds,
              filterMMListTokens: queryOptions?.filterMMListTokens,
              networks: queryOptions?.networks,
            },
          },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.NETWORKS,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }

  // ==========================================================================
  // BALANCES
  // ==========================================================================

  /**
   * Get account balances for a single address (v2 endpoint).
   *
   * @param address - The account address.
   * @param queryOptions - Query filter options.
   * @param queryOptions.networks - Networks to filter by.
   * @param options - Fetch options including cache settings.
   * @returns The account balances response.
   */
  async fetchV2Balances(
    address: string,
    queryOptions?: { networks?: number[] },
    options?: FetchOptions,
  ): Promise<V2BalancesResponse> {
    return this.queryClient.fetchQuery({
      queryKey: [
        'accounts',
        'balances',
        'v2',
        {
          address,
          options: queryOptions && {
            ...queryOptions,
            networks:
              queryOptions.networks && [...queryOptions.networks].sort(),
          },
        },
      ],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<V2BalancesResponse>(
          API_URLS.ACCOUNTS,
          `/v2/accounts/${address}/balances`,
          {
            signal,
            params: { networks: queryOptions?.networks },
          },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.BALANCES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }

  /**
   * Get account balances with additional options (v2 endpoint).
   *
   * @param address - The account address.
   * @param queryOptions - Query filter options.
   * @param queryOptions.networks - Networks to filter by.
   * @param queryOptions.filterSupportedTokens - Whether to filter supported tokens.
   * @param queryOptions.includeTokenAddresses - Token addresses to include.
   * @param queryOptions.includeStakedAssets - Whether to include staked assets.
   * @param options - Fetch options including cache settings.
   * @returns The account balances response.
   */
  async fetchV2BalancesWithOptions(
    address: string,
    queryOptions?: {
      networks?: number[];
      filterSupportedTokens?: boolean;
      includeTokenAddresses?: string[];
      includeStakedAssets?: boolean;
    },
    options?: FetchOptions,
  ): Promise<V2BalancesResponse> {
    return this.queryClient.fetchQuery({
      queryKey: [
        'accounts',
        'balances',
        'v2',
        {
          address,
          options: queryOptions && {
            ...queryOptions,
            networks:
              queryOptions.networks && [...queryOptions.networks].sort(),
            includeTokenAddresses:
              queryOptions.includeTokenAddresses &&
              [...queryOptions.includeTokenAddresses].sort(),
          },
        },
      ],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<V2BalancesResponse>(
          API_URLS.ACCOUNTS,
          `/v2/accounts/${address}/balances`,
          {
            signal,
            params: {
              networks: queryOptions?.networks,
              filterSupportedTokens: queryOptions?.filterSupportedTokens,
              includeTokenAddresses: queryOptions?.includeTokenAddresses,
              includeStakedAssets: queryOptions?.includeStakedAssets,
            },
          },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.BALANCES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }

  /**
   * Get balances for multiple accounts (v4 endpoint).
   *
   * @param accountAddresses - Array of account addresses.
   * @param queryOptions - Query filter options.
   * @param queryOptions.networks - Networks to filter by.
   * @param options - Fetch options including cache settings.
   * @returns The multi-account balances response.
   */
  async fetchV4MultiAccountBalances(
    accountAddresses: string[],
    queryOptions?: { networks?: number[] },
    options?: FetchOptions,
  ): Promise<V4BalancesResponse> {
    return this.queryClient.fetchQuery({
      queryKey: [
        'accounts',
        'balances',
        'v4',
        {
          accountAddresses: [...accountAddresses].sort(),
          options: queryOptions && {
            ...queryOptions,
            networks:
              queryOptions.networks && [...queryOptions.networks].sort(),
          },
        },
      ],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<V4BalancesResponse>(
          API_URLS.ACCOUNTS,
          '/v4/multiaccount/balances',
          {
            signal,
            params: {
              accountAddresses,
              networks: queryOptions?.networks,
            },
          },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.BALANCES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }

  /**
   * Get balances for multiple accounts using CAIP-10 IDs (v5 endpoint).
   *
   * @param accountIds - Array of CAIP-10 account IDs.
   * @param queryOptions - Query filter options.
   * @param queryOptions.filterMMListTokens - Whether to filter MM list tokens.
   * @param queryOptions.networks - Networks to filter by.
   * @param queryOptions.includeStakedAssets - Whether to include staked assets.
   * @param options - Fetch options including cache settings.
   * @returns The multi-account balances response.
   */
  async fetchV5MultiAccountBalances(
    accountIds: string[],
    queryOptions?: {
      filterMMListTokens?: boolean;
      networks?: string[];
      includeStakedAssets?: boolean;
    },
    options?: FetchOptions,
  ): Promise<V5BalancesResponse> {
    return this.queryClient.fetchQuery({
      queryKey: [
        'accounts',
        'balances',
        'v5',
        {
          accountIds: [...accountIds].sort(),
          options: queryOptions && {
            ...queryOptions,
            networks:
              queryOptions.networks && [...queryOptions.networks].sort(),
          },
        },
      ],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<V5BalancesResponse>(
          API_URLS.ACCOUNTS,
          '/v5/multiaccount/balances',
          {
            signal,
            params: {
              accountIds,
              networks: queryOptions?.networks,
              filterMMListTokens: queryOptions?.filterMMListTokens,
              includeStakedAssets: queryOptions?.includeStakedAssets,
            },
          },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.BALANCES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }

  // ==========================================================================
  // TRANSACTIONS
  // ==========================================================================

  /**
   * Get a specific transaction by hash (v1 endpoint).
   *
   * @param chainId - The chain ID.
   * @param txHash - The transaction hash.
   * @param queryOptions - Query filter options.
   * @param queryOptions.includeLogs - Whether to include logs.
   * @param queryOptions.includeValueTransfers - Whether to include value transfers.
   * @param queryOptions.includeTxMetadata - Whether to include transaction metadata.
   * @param queryOptions.lang - Language for metadata.
   * @param options - Fetch options including cache settings.
   * @returns The transaction details.
   */
  async fetchV1TransactionByHash(
    chainId: number,
    txHash: string,
    queryOptions?: {
      includeLogs?: boolean;
      includeValueTransfers?: boolean;
      includeTxMetadata?: boolean;
      lang?: string;
    },
    options?: FetchOptions,
  ): Promise<V1TransactionByHashResponse> {
    return this.queryClient.fetchQuery({
      queryKey: [
        'accounts',
        'transactions',
        'v1ByHash',
        { chainId, txHash, options: queryOptions },
      ],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<V1TransactionByHashResponse>(
          API_URLS.ACCOUNTS,
          `/v1/networks/${chainId}/transactions/${txHash}`,
          {
            signal,
            params: {
              includeLogs: queryOptions?.includeLogs,
              includeValueTransfers: queryOptions?.includeValueTransfers,
              includeTxMetadata: queryOptions?.includeTxMetadata,
              lang: queryOptions?.lang,
            },
          },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.TRANSACTIONS,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }

  /**
   * Get account transactions (v1 endpoint).
   *
   * @param address - The account address.
   * @param queryOptions - Query filter options.
   * @param queryOptions.chainIds - Chain IDs to filter by.
   * @param queryOptions.cursor - Pagination cursor.
   * @param queryOptions.startTimestamp - Start timestamp filter.
   * @param queryOptions.endTimestamp - End timestamp filter.
   * @param queryOptions.sortDirection - Sort direction (ASC/DESC).
   * @param options - Fetch options including cache settings.
   * @returns The account transactions response.
   */
  async fetchV1AccountTransactions(
    address: string,
    queryOptions?: {
      chainIds?: string[];
      cursor?: string;
      startTimestamp?: number;
      endTimestamp?: number;
      sortDirection?: 'ASC' | 'DESC';
    },
    options?: FetchOptions,
  ): Promise<V1AccountTransactionsResponse> {
    return this.queryClient.fetchQuery({
      queryKey: [
        'accounts',
        'transactions',
        'v1Account',
        {
          address,
          options: queryOptions && {
            ...queryOptions,
            chainIds:
              queryOptions.chainIds && [...queryOptions.chainIds].sort(),
          },
        },
      ],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<V1AccountTransactionsResponse>(
          API_URLS.ACCOUNTS,
          `/v1/accounts/${address}/transactions`,
          {
            signal,
            params: {
              networks: queryOptions?.chainIds,
              cursor: queryOptions?.cursor,
              startTimestamp: queryOptions?.startTimestamp,
              endTimestamp: queryOptions?.endTimestamp,
              sortDirection: queryOptions?.sortDirection,
            },
          },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.TRANSACTIONS,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }

  /**
   * Get multi-account transactions (v4 endpoint).
   *
   * @param accountIds - Array of CAIP-10 account IDs.
   * @param queryOptions - Query filter options.
   * @param queryOptions.networks - Networks to filter by.
   * @param queryOptions.cursor - Pagination cursor.
   * @param queryOptions.sortDirection - Sort direction (ASC/DESC).
   * @param queryOptions.includeLogs - Whether to include logs.
   * @param queryOptions.includeValueTransfers - Whether to include value transfers.
   * @param queryOptions.includeTxMetadata - Whether to include transaction metadata.
   * @param options - Fetch options including cache settings.
   * @returns The multi-account transactions response.
   */
  async fetchV4MultiAccountTransactions(
    accountIds: string[],
    queryOptions?: {
      networks?: string[];
      cursor?: string;
      sortDirection?: 'ASC' | 'DESC';
      includeLogs?: boolean;
      includeValueTransfers?: boolean;
      includeTxMetadata?: boolean;
    },
    options?: FetchOptions,
  ): Promise<V4MultiAccountTransactionsResponse> {
    return this.queryClient.fetchQuery({
      queryKey: [
        'accounts',
        'transactions',
        'v4MultiAccount',
        {
          accountIds: [...accountIds].sort(),
          options: queryOptions && {
            ...queryOptions,
            networks:
              queryOptions.networks && [...queryOptions.networks].sort(),
          },
        },
      ],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<V4MultiAccountTransactionsResponse>(
          API_URLS.ACCOUNTS,
          '/v4/multiaccount/transactions',
          {
            signal,
            params: {
              accountIds,
              networks: queryOptions?.networks,
              cursor: queryOptions?.cursor,
              sortDirection: queryOptions?.sortDirection,
              includeLogs: queryOptions?.includeLogs,
              includeValueTransfers: queryOptions?.includeValueTransfers,
              includeTxMetadata: queryOptions?.includeTxMetadata,
            },
          },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.TRANSACTIONS,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }

  // ==========================================================================
  // RELATIONSHIPS
  // ==========================================================================

  /**
   * Get account address relationship (v1 endpoint).
   *
   * @param chainId - The chain ID.
   * @param from - The from address.
   * @param to - The to address.
   * @param options - Fetch options including cache settings.
   * @returns The account relationship result.
   */
  async fetchV1AccountRelationship(
    chainId: number,
    from: string,
    to: string,
    options?: FetchOptions,
  ): Promise<V1AccountRelationshipResult> {
    return this.queryClient.fetchQuery({
      queryKey: ['accounts', 'v1Relationship', chainId, from, to],
      queryFn: async ({ signal }: QueryFunctionContext) => {
        try {
          return await this.fetch<V1AccountRelationshipResult>(
            API_URLS.ACCOUNTS,
            `/v1/networks/${chainId}/accounts/${from}/relationships/${to}`,
            { signal },
          );
        } catch (error) {
          if (error instanceof HttpError && typeof error.body === 'object') {
            const body = error.body as {
              error?: { code?: string; message?: string };
            } | null;
            if (
              body?.error &&
              typeof body.error === 'object' &&
              typeof body.error.code === 'string' &&
              typeof body.error.message === 'string'
            ) {
              return {
                error: {
                  code: body.error.code,
                  message: body.error.message,
                },
              };
            }
          }
          throw error;
        }
      },
      staleTime: options?.staleTime ?? STALE_TIMES.DEFAULT,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }

  // ==========================================================================
  // NFTs
  // ==========================================================================

  /**
   * Get NFTs owned by an account (v2 endpoint).
   *
   * @param address - The account address.
   * @param queryOptions - Query filter options.
   * @param queryOptions.networks - Networks to filter by.
   * @param queryOptions.cursor - Pagination cursor.
   * @param options - Fetch options including cache settings.
   * @returns The NFTs response.
   */
  async fetchV2AccountNfts(
    address: string,
    queryOptions?: { networks?: number[]; cursor?: string },
    options?: FetchOptions,
  ): Promise<V2NftsResponse> {
    return this.queryClient.fetchQuery({
      queryKey: [
        'accounts',
        'v2Nfts',
        {
          address,
          options: queryOptions && {
            ...queryOptions,
            networks:
              queryOptions.networks && [...queryOptions.networks].sort(),
          },
        },
      ],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<V2NftsResponse>(
          API_URLS.ACCOUNTS,
          `/v2/accounts/${address}/nfts`,
          {
            signal,
            params: {
              networks: queryOptions?.networks,
              cursor: queryOptions?.cursor,
            },
          },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.DEFAULT,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }

  // ==========================================================================
  // TOKEN DISCOVERY
  // ==========================================================================

  /**
   * Get ERC20 tokens detected for an account (v2 endpoint).
   *
   * @param address - The account address.
   * @param queryOptions - Query filter options.
   * @param queryOptions.networks - Networks to filter by.
   * @param options - Fetch options including cache settings.
   * @returns The tokens response.
   */
  async fetchV2AccountTokens(
    address: string,
    queryOptions?: { networks?: number[] },
    options?: FetchOptions,
  ): Promise<V2TokensResponse> {
    return this.queryClient.fetchQuery({
      queryKey: [
        'accounts',
        'v2Tokens',
        {
          address,
          options: queryOptions && {
            ...queryOptions,
            networks:
              queryOptions.networks && [...queryOptions.networks].sort(),
          },
        },
      ],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<V2TokensResponse>(
          API_URLS.ACCOUNTS,
          `/v2/accounts/${address}/tokens`,
          {
            signal,
            params: { networks: queryOptions?.networks },
          },
        ),
      staleTime: options?.staleTime ?? STALE_TIMES.DEFAULT,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    });
  }
}
