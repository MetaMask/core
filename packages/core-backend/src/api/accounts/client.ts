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

import type {
  FetchInfiniteQueryOptions,
  FetchQueryOptions,
  QueryFunctionContext,
} from '@tanstack/query-core';

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
import { BaseApiClient, API_URLS, STALE_TIMES, GC_TIMES } from '../base-client';
import { getQueryOptionsOverrides } from '../shared-types';
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
   * Returns the TanStack Query options object for v1 supported networks.
   *
   * @param options - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getV1SupportedNetworksQueryOptions(
    options?: FetchOptions,
  ): FetchQueryOptions<V1SupportedNetworksResponse> {
    return {
      queryKey: ['accounts', 'v1SupportedNetworks'],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<V1SupportedNetworksResponse>(
          API_URLS.ACCOUNTS,
          '/v1/supportedNetworks',
          { signal },
        ),
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.SUPPORTED_NETWORKS,
      gcTime: options?.gcTime ?? GC_TIMES.EXTENDED,
    };
  }

  /**
   * Get list of supported networks (v1 endpoint).
   *
   * @param options - Fetch options including cache settings.
   * @returns The list of supported networks.
   */
  async fetchV1SupportedNetworks(
    options?: FetchOptions,
  ): Promise<V1SupportedNetworksResponse> {
    return this.queryClient.fetchQuery(
      this.getV1SupportedNetworksQueryOptions(options),
    );
  }

  /**
   * Returns the TanStack Query options object for v2 supported networks.
   *
   * @param options - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getV2SupportedNetworksQueryOptions(
    options?: FetchOptions,
  ): FetchQueryOptions<V2SupportedNetworksResponse> {
    return {
      queryKey: ['accounts', 'v2SupportedNetworks'],
      queryFn: ({ signal }: QueryFunctionContext) =>
        this.fetch<V2SupportedNetworksResponse>(
          API_URLS.ACCOUNTS,
          '/v2/supportedNetworks',
          { signal },
        ),
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.SUPPORTED_NETWORKS,
      gcTime: options?.gcTime ?? GC_TIMES.EXTENDED,
    };
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
    return this.queryClient.fetchQuery(
      this.getV2SupportedNetworksQueryOptions(options),
    );
  }

  // ==========================================================================
  // ACTIVE NETWORKS
  // ==========================================================================

  /**
   * Returns the TanStack Query options object for v2 active networks.
   *
   * @param accountIds - Array of CAIP-10 account IDs.
   * @param queryOptions - Query filter options.
   * @param queryOptions.filterMMListTokens - Whether to filter MM list tokens.
   * @param queryOptions.networks - Networks to filter by.
   * @param options - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getV2ActiveNetworksQueryOptions(
    accountIds: string[],
    queryOptions?: { filterMMListTokens?: boolean; networks?: string[] },
    options?: FetchOptions,
  ): FetchQueryOptions<V2ActiveNetworksResponse> {
    return {
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
      queryFn: async ({
        signal,
      }: QueryFunctionContext): Promise<V2ActiveNetworksResponse> => {
        if (accountIds.length === 0) {
          return { activeNetworks: [] };
        }
        return this.fetch<V2ActiveNetworksResponse>(
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
        );
      },
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.NETWORKS,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    };
  }

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
    if (accountIds.length === 0) {
      return { activeNetworks: [] };
    }
    return this.queryClient.fetchQuery(
      this.getV2ActiveNetworksQueryOptions(accountIds, queryOptions, options),
    );
  }

  // ==========================================================================
  // BALANCES
  // ==========================================================================

  /**
   * Returns the TanStack Query options object for v2 balances.
   *
   * @param address - The account address.
   * @param queryOptions - Query filter options.
   * @param queryOptions.networks - Networks to filter by.
   * @param queryOptions.filterSupportedTokens - Whether to filter supported tokens.
   * @param queryOptions.includeTokenAddresses - Token addresses to include.
   * @param queryOptions.includeStakedAssets - Whether to include staked assets.
   * @param options - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getV2BalancesQueryOptions(
    address: string,
    queryOptions?: {
      networks?: number[];
      filterSupportedTokens?: boolean;
      includeTokenAddresses?: string[];
      includeStakedAssets?: boolean;
    },
    options?: FetchOptions,
  ): FetchQueryOptions<V2BalancesResponse> {
    return {
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
      queryFn: async ({
        signal,
      }: QueryFunctionContext): Promise<V2BalancesResponse> => {
        if (address === '') {
          return { count: 0, balances: [], unprocessedNetworks: [] };
        }
        return this.fetch<V2BalancesResponse>(
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
        );
      },
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.BALANCES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    };
  }

  /**
   * Get account balances for a single address (v2 endpoint).
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
  async fetchV2Balances(
    address: string,
    queryOptions?: {
      networks?: number[];
      filterSupportedTokens?: boolean;
      includeTokenAddresses?: string[];
      includeStakedAssets?: boolean;
    },
    options?: FetchOptions,
  ): Promise<V2BalancesResponse> {
    if (address === '') {
      return { count: 0, balances: [], unprocessedNetworks: [] };
    }
    return this.queryClient.fetchQuery(
      this.getV2BalancesQueryOptions(address, queryOptions, options),
    );
  }

  /**
   * Returns the TanStack Query options object for v4 multi-account balances.
   *
   * @param accountAddresses - Array of account addresses.
   * @param queryOptions - Query filter options.
   * @param queryOptions.networks - Networks to filter by.
   * @param options - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getV4MultiAccountBalancesQueryOptions(
    accountAddresses: string[],
    queryOptions?: { networks?: number[] },
    options?: FetchOptions,
  ): FetchQueryOptions<V4BalancesResponse> {
    return {
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
      queryFn: async ({
        signal,
      }: QueryFunctionContext): Promise<V4BalancesResponse> => {
        if (accountAddresses.length === 0) {
          return { count: 0, balances: [], unprocessedNetworks: [] };
        }
        return this.fetch<V4BalancesResponse>(
          API_URLS.ACCOUNTS,
          '/v4/multiaccount/balances',
          {
            signal,
            params: {
              accountAddresses,
              networks: queryOptions?.networks,
            },
          },
        );
      },
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.BALANCES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    };
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
    if (accountAddresses.length === 0) {
      return { count: 0, balances: [], unprocessedNetworks: [] };
    }
    return this.queryClient.fetchQuery(
      this.getV4MultiAccountBalancesQueryOptions(
        accountAddresses,
        queryOptions,
        options,
      ),
    );
  }

  /**
   * Returns the TanStack Query options object for v5 multi-account balances.
   *
   * @param accountIds - Array of CAIP-10 account IDs.
   * @param queryOptions - Query filter options.
   * @param queryOptions.filterMMListTokens - Whether to filter MM list tokens.
   * @param queryOptions.networks - Networks to filter by.
   * @param queryOptions.includeStakedAssets - Whether to include staked assets.
   * @param options - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getV5MultiAccountBalancesQueryOptions(
    accountIds: string[],
    queryOptions?: {
      filterMMListTokens?: boolean;
      networks?: string[];
      includeStakedAssets?: boolean;
    },
    options?: FetchOptions,
  ): FetchQueryOptions<V5BalancesResponse> {
    return {
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
      queryFn: async ({
        signal,
      }: QueryFunctionContext): Promise<V5BalancesResponse> => {
        if (accountIds.length === 0) {
          return { count: 0, unprocessedNetworks: [], balances: [] };
        }
        return this.fetch<V5BalancesResponse>(
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
        );
      },
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.BALANCES,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    };
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
    if (accountIds.length === 0) {
      return { count: 0, unprocessedNetworks: [], balances: [] };
    }
    return this.queryClient.fetchQuery(
      this.getV5MultiAccountBalancesQueryOptions(
        accountIds,
        queryOptions,
        options,
      ),
    );
  }

  // ==========================================================================
  // TRANSACTIONS
  // ==========================================================================

  /**
   * Returns the TanStack Query options object for v1 transaction by hash.
   *
   * @param chainId - The chain ID.
   * @param txHash - The transaction hash.
   * @param queryOptions - Query filter options.
   * @param queryOptions.includeLogs - Whether to include logs.
   * @param queryOptions.includeValueTransfers - Whether to include value transfers.
   * @param queryOptions.includeTxMetadata - Whether to include transaction metadata.
   * @param queryOptions.lang - Language for metadata.
   * @param options - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getV1TransactionByHashQueryOptions(
    chainId: number,
    txHash: string,
    queryOptions?: {
      includeLogs?: boolean;
      includeValueTransfers?: boolean;
      includeTxMetadata?: boolean;
      lang?: string;
    },
    options?: FetchOptions,
  ): FetchQueryOptions<V1TransactionByHashResponse> {
    return {
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
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.TRANSACTIONS,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    };
  }

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
    return this.queryClient.fetchQuery(
      this.getV1TransactionByHashQueryOptions(
        chainId,
        txHash,
        queryOptions,
        options,
      ),
    );
  }

  /**
   * Returns the TanStack Query options object for v1 account transactions.
   *
   * @param address - The account address.
   * @param queryOptions - Query filter options.
   * @param queryOptions.chainIds - Chain IDs to filter by.
   * @param queryOptions.cursor - Pagination cursor.
   * @param queryOptions.startTimestamp - Start timestamp filter.
   * @param queryOptions.endTimestamp - End timestamp filter.
   * @param queryOptions.sortDirection - Sort direction (ASC/DESC).
   * @param options - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useInfiniteQuery, useSuspenseQuery, etc.
   */
  getV1AccountTransactionsQueryOptions(
    address: string,
    queryOptions?: {
      chainIds?: string[];
      cursor?: string;
      startTimestamp?: number;
      endTimestamp?: number;
      sortDirection?: 'ASC' | 'DESC';
    },
    options?: FetchOptions,
  ): FetchQueryOptions<V1AccountTransactionsResponse> {
    return {
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
      queryFn: async ({
        signal,
      }: QueryFunctionContext): Promise<V1AccountTransactionsResponse> => {
        if (address === '') {
          return { data: [], pageInfo: { count: 0, hasNextPage: false } };
        }
        return this.fetch<V1AccountTransactionsResponse>(
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
        );
      },
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.TRANSACTIONS,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    };
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
    if (address === '') {
      return { data: [], pageInfo: { count: 0, hasNextPage: false } };
    }
    return this.queryClient.fetchQuery(
      this.getV1AccountTransactionsQueryOptions(address, queryOptions, options),
    );
  }

  /**
   * Returns the TanStack Query options object for v4 multi-account transactions.
   * Use this with `queryClient.fetchQuery()`, `useQuery()`, `useInfiniteQuery()`,
   * `useSuspenseQuery()`, etc. for flexibility across query permutations.
   *
   * @param accountAddresses - Array of CAIP-10 account addresses.
   * @param queryOptions - Query filter options.
   * @param queryOptions.networks - Comma-separated CAIP-2 network IDs.
   * @param queryOptions.startTimestamp - Start timestamp (epoch) from which to return results.
   * @param queryOptions.endTimestamp - End timestamp (epoch) for which to return results.
   * @param queryOptions.cursor - Pagination cursor (deprecated, use after).
   * @param queryOptions.limit - Maximum number of transactions to request (default 50).
   * @param queryOptions.after - JWT containing the endCursor for the query.
   * @param queryOptions.before - JWT containing the startCursor for the query.
   * @param queryOptions.sortDirection - Sort direction (ASC/DESC).
   * @param queryOptions.includeLogs - Whether to include logs.
   * @param queryOptions.includeTxMetadata - Whether to include transaction metadata.
   * @param queryOptions.maxLogsPerTx - Maximum number of logs per transaction.
   * @param queryOptions.lang - Language for transaction category (default "en").
   * @param options - Fetch options including cache settings.
   * @returns Query options object compatible with fetchQuery/useQuery/useInfiniteQuery.
   */
  getV4MultiAccountTransactionsQueryOptions(
    accountAddresses: string[],
    queryOptions?: {
      networks?: string[];
      startTimestamp?: number;
      endTimestamp?: number;
      cursor?: string;
      limit?: number;
      after?: string;
      before?: string;
      sortDirection?: 'ASC' | 'DESC';
      includeLogs?: boolean;
      includeTxMetadata?: boolean;
      maxLogsPerTx?: number;
      lang?: string;
    },
    options?: FetchOptions,
  ): FetchQueryOptions<V4MultiAccountTransactionsResponse> {
    return {
      queryKey: [
        'accounts',
        'transactions',
        'v4MultiAccount',
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
        this.fetch<V4MultiAccountTransactionsResponse>(
          API_URLS.ACCOUNTS,
          '/v4/multiaccount/transactions',
          {
            signal,
            params: {
              accountAddresses,
              networks: queryOptions?.networks,
              startTimestamp: queryOptions?.startTimestamp,
              endTimestamp: queryOptions?.endTimestamp,
              cursor: queryOptions?.cursor,
              limit: queryOptions?.limit,
              after: queryOptions?.after,
              before: queryOptions?.before,
              sortDirection: queryOptions?.sortDirection,
              includeLogs: queryOptions?.includeLogs,
              includeTxMetadata: queryOptions?.includeTxMetadata,
              maxLogsPerTx: queryOptions?.maxLogsPerTx,
              lang: queryOptions?.lang,
            },
          },
        ),
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.TRANSACTIONS,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    };
  }

  /**
   * Returns TanStack Query options for v4 multi-account transactions,
   * designed for use with `useInfiniteQuery`.
   *
   * @param params - API endpoint parameters (excluding pagination cursors).
   * @param params.accountAddresses - Array of CAIP-10 account addresses.
   * @param params.networks - CAIP-2 network IDs to filter by.
   * @param params.startTimestamp - Start timestamp (epoch).
   * @param params.endTimestamp - End timestamp (epoch).
   * @param params.limit - Max transactions per page (default 50).
   * @param params.sortDirection - Sort direction (ASC/DESC).
   * @param params.includeLogs - Whether to include logs.
   * @param params.includeTxMetadata - Whether to include transaction metadata.
   * @param params.maxLogsPerTx - Max logs per transaction.
   * @param params.lang - Language for transaction category (default "en").
   * @param options - Fetch options including cache settings.
   * @returns Options object compatible with `useInfiniteQuery`.
   */
  getV4MultiAccountTransactionsInfiniteQueryOptions(
    params: {
      accountAddresses: string[];
      networks?: string[];
      startTimestamp?: number;
      endTimestamp?: number;
      limit?: number;
      sortDirection?: 'ASC' | 'DESC';
      includeLogs?: boolean;
      includeTxMetadata?: boolean;
      maxLogsPerTx?: number;
      lang?: string;
    },
    options?: FetchOptions,
  ): FetchInfiniteQueryOptions<
    V4MultiAccountTransactionsResponse,
    Error,
    V4MultiAccountTransactionsResponse,
    readonly unknown[],
    string | undefined
  > {
    return {
      queryKey: [
        'accounts',
        'transactions',
        'v4MultiAccount',
        {
          accountAddresses: [...params.accountAddresses].sort(),
          networks: params.networks && [...params.networks].sort(),
          startTimestamp: params.startTimestamp,
          endTimestamp: params.endTimestamp,
          limit: params.limit,
          sortDirection: params.sortDirection,
          includeLogs: params.includeLogs,
          includeTxMetadata: params.includeTxMetadata,
          maxLogsPerTx: params.maxLogsPerTx,
          lang: params.lang,
        },
      ] as const,
      queryFn: ({
        pageParam,
        signal,
      }: {
        pageParam?: string;
        signal?: AbortSignal;
      }) =>
        this.fetch<V4MultiAccountTransactionsResponse>(
          API_URLS.ACCOUNTS,
          '/v4/multiaccount/transactions',
          {
            signal,
            params: {
              accountAddresses: params.accountAddresses,
              networks: params.networks,
              startTimestamp: params.startTimestamp,
              endTimestamp: params.endTimestamp,
              cursor: pageParam,
              limit: params.limit,
              sortDirection: params.sortDirection,
              includeLogs: params.includeLogs,
              includeTxMetadata: params.includeTxMetadata,
              maxLogsPerTx: params.maxLogsPerTx,
              lang: params.lang,
            },
          },
        ),
      getNextPageParam: ({ pageInfo }: V4MultiAccountTransactionsResponse) =>
        pageInfo.hasNextPage ? pageInfo.endCursor : undefined,
      initialPageParam: options?.initialPageParam,
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.TRANSACTIONS,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    };
  }

  /**
   * Get multi-account transactions (v4 endpoint).
   *
   * @param accountAddresses - Array of CAIP-10 account addresses.
   * @param queryOptions - Query filter options.
   * @param queryOptions.networks - Comma-separated CAIP-2 network IDs.
   * @param queryOptions.startTimestamp - Start timestamp (epoch) from which to return results.
   * @param queryOptions.endTimestamp - End timestamp (epoch) for which to return results.
   * @param queryOptions.cursor - Pagination cursor (deprecated, use after).
   * @param queryOptions.limit - Maximum number of transactions to request (default 50).
   * @param queryOptions.after - JWT containing the endCursor for the query.
   * @param queryOptions.before - JWT containing the startCursor for the query.
   * @param queryOptions.sortDirection - Sort direction (ASC/DESC).
   * @param queryOptions.includeLogs - Whether to include logs.
   * @param queryOptions.includeTxMetadata - Whether to include transaction metadata.
   * @param queryOptions.maxLogsPerTx - Maximum number of logs per transaction.
   * @param queryOptions.lang - Language for transaction category (default "en").
   * @param options - Fetch options including cache settings.
   * @returns The multi-account transactions response.
   */
  async fetchV4MultiAccountTransactions(
    accountAddresses: string[],
    queryOptions?: {
      networks?: string[];
      startTimestamp?: number;
      endTimestamp?: number;
      cursor?: string;
      limit?: number;
      after?: string;
      before?: string;
      sortDirection?: 'ASC' | 'DESC';
      includeLogs?: boolean;
      includeTxMetadata?: boolean;
      maxLogsPerTx?: number;
      lang?: string;
    },
    options?: FetchOptions,
  ): Promise<V4MultiAccountTransactionsResponse> {
    return this.queryClient.fetchQuery(
      this.getV4MultiAccountTransactionsQueryOptions(
        accountAddresses,
        queryOptions,
        options,
      ),
    );
  }

  // ==========================================================================
  // RELATIONSHIPS
  // ==========================================================================

  /**
   * Returns the TanStack Query options object for v1 account relationship.
   *
   * @param chainId - The chain ID.
   * @param from - The from address.
   * @param to - The to address.
   * @param options - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getV1AccountRelationshipQueryOptions(
    chainId: number,
    from: string,
    to: string,
    options?: FetchOptions,
  ): FetchQueryOptions<V1AccountRelationshipResult> {
    return {
      queryKey: ['accounts', 'v1Relationship', chainId, from, to],
      queryFn: async ({
        signal,
      }: QueryFunctionContext): Promise<V1AccountRelationshipResult> =>
        this.fetch<V1AccountRelationshipResult>(
          API_URLS.ACCOUNTS,
          `/v1/networks/${chainId}/accounts/${from}/relationships/${to}`,
          { signal },
        ),
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.DEFAULT,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    };
  }

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
    return this.queryClient.fetchQuery(
      this.getV1AccountRelationshipQueryOptions(chainId, from, to, options),
    );
  }

  // ==========================================================================
  // NFTs
  // ==========================================================================

  /**
   * Returns the TanStack Query options object for v2 account NFTs.
   *
   * @param address - The account address.
   * @param queryOptions - Query filter options.
   * @param queryOptions.networks - Networks to filter by.
   * @param queryOptions.cursor - Pagination cursor.
   * @param options - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getV2AccountNftsQueryOptions(
    address: string,
    queryOptions?: { networks?: number[]; cursor?: string },
    options?: FetchOptions,
  ): FetchQueryOptions<V2NftsResponse> {
    return {
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
      queryFn: async ({
        signal,
      }: QueryFunctionContext): Promise<V2NftsResponse> => {
        if (address === '') {
          return { data: [], pageInfo: { count: 0, hasNextPage: false } };
        }
        return this.fetch<V2NftsResponse>(
          API_URLS.ACCOUNTS,
          `/v2/accounts/${address}/nfts`,
          {
            signal,
            params: {
              networks: queryOptions?.networks,
              cursor: queryOptions?.cursor,
            },
          },
        );
      },
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.DEFAULT,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    };
  }

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
    if (address === '') {
      return { data: [], pageInfo: { count: 0, hasNextPage: false } };
    }
    return this.queryClient.fetchQuery(
      this.getV2AccountNftsQueryOptions(address, queryOptions, options),
    );
  }

  // ==========================================================================
  // TOKEN DISCOVERY
  // ==========================================================================

  /**
   * Returns the TanStack Query options object for v2 account tokens.
   *
   * @param address - The account address.
   * @param queryOptions - Query filter options.
   * @param queryOptions.networks - Networks to filter by.
   * @param options - Fetch options including cache settings.
   * @returns TanStack Query options for use with useQuery, useSuspenseQuery, etc.
   */
  getV2AccountTokensQueryOptions(
    address: string,
    queryOptions?: { networks?: number[] },
    options?: FetchOptions,
  ): FetchQueryOptions<V2TokensResponse> {
    return {
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
      queryFn: async ({
        signal,
      }: QueryFunctionContext): Promise<V2TokensResponse> => {
        if (address === '') {
          return { data: [] };
        }
        return this.fetch<V2TokensResponse>(
          API_URLS.ACCOUNTS,
          `/v2/accounts/${address}/tokens`,
          {
            signal,
            params: { networks: queryOptions?.networks },
          },
        );
      },
      ...getQueryOptionsOverrides(options),
      staleTime: options?.staleTime ?? STALE_TIMES.DEFAULT,
      gcTime: options?.gcTime ?? GC_TIMES.DEFAULT,
    };
  }

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
    if (address === '') {
      return { data: [] };
    }
    return this.queryClient.fetchQuery(
      this.getV2AccountTokensQueryOptions(address, queryOptions, options),
    );
  }
}
