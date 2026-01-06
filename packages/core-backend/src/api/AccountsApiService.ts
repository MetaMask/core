/**
 * Accounts API Service for MetaMask
 *
 * Provides SDK methods for interacting with the Accounts API (v1, v2 and v4).
 * Supports account balances, transactions, and address relationship lookups.
 *
 * This is a plain service class. For Messenger integration, use BackendApiClient.
 *
 * @see https://accounts.api.cx.metamask.io/docs-json
 */

import { HttpClient } from './HttpClient';
import type {
  BaseApiServiceOptions,
  GetBalancesOptions,
  GetV2BalancesResponse,
  GetMultiAccountBalancesOptions,
  GetV4MultiAccountBalancesResponse,
  GetV1SupportedNetworksResponse,
  GetV2SupportedNetworksResponse,
  GetAccountTransactionsOptions,
  GetAccountTransactionsResponse,
  GetAccountRelationshipOptions,
  AccountRelationshipResult,
} from './types';

/**
 * Default Accounts API base URL
 */
const DEFAULT_BASE_URL = 'https://accounts.api.cx.metamask.io';

/**
 * Accounts API Service Options
 */
export type AccountsApiServiceOptions = BaseApiServiceOptions;

/**
 * Active networks response (v2)
 */
export type GetV2ActiveNetworksResponse = {
  /** Active networks for the accounts */
  activeNetworks: string[];
};

/**
 * Transaction by hash response
 */
export type TransactionByHashResponse = {
  hash: string;
  timestamp: string;
  chainId: number;
  blockNumber: number;
  blockHash: string;
  gas: number;
  gasUsed: number;
  gasPrice: string;
  effectiveGasPrice: number;
  nonce: number;
  cumulativeGasUsed: number;
  methodId?: string;
  value: string;
  to: string;
  from: string;
  isError?: boolean;
  valueTransfers?: {
    from: string;
    to: string;
    amount: string;
    decimal: number;
    contractAddress: string;
    symbol: string;
    name: string;
    transferType: string;
  }[];
  logs?: {
    data: string;
    topics: string[];
    address: string;
    logIndex: number;
  }[];
  transactionType?: string;
  transactionCategory?: string;
  transactionProtocol?: string;
};

/**
 * Multi-account transactions response (v4)
 */
export type GetV4MultiAccountTransactionsResponse = {
  unprocessedNetworks: string[];
  pageInfo: {
    count: number;
    hasNextPage: boolean;
    endCursor?: string;
  };
  data: TransactionByHashResponse[];
};

/**
 * Multi-account balances response (v5)
 * Uses CAIP-10 account IDs
 */
export type GetV5MultiAccountBalancesResponse = {
  /** Unprocessed accounts/networks */
  unprocessedNetworks: string[];
  /** Balance data keyed by CAIP-10 account ID */
  balances: {
    [accountId: string]: {
      chainId: string;
      nativeBalance?: string;
      tokenBalances?: {
        address: string;
        balance: string;
        symbol?: string;
        decimals?: number;
        name?: string;
        iconUrl?: string;
      }[];
    }[];
  };
};

/**
 * Accounts API Service
 *
 * SDK for interacting with MetaMask's Accounts API endpoints.
 * Provides methods for fetching account balances, transactions, and relationships.
 *
 * All methods are prefixed with their API version (v1, v2, v4) for clarity.
 */
/**
 * Method names exposed via BackendApiClient messenger
 */
export const ACCOUNTS_API_METHODS = [
  // Health & Utility
  'getServiceMetadata',
  'getHealth',
  // Supported Networks
  'getV1SupportedNetworks',
  'getV2SupportedNetworks',
  // Active Networks
  'getV2ActiveNetworks',
  // Balances (v2 - single address)
  'getV2Balances',
  'getV2BalancesWithOptions',
  // Balances (v4 - multi-account with addresses)
  'getV4MultiAccountBalances',
  // Balances (v5 - multi-account with CAIP-10 IDs)
  'getV5MultiAccountBalances',
  // Transactions
  'getV1TransactionByHash',
  'getV1AccountTransactions',
  'getV4MultiAccountTransactions',
  // Relationships
  'getV1AccountRelationship',
  // NFTs
  'getV2AccountNfts',
  // Tokens
  'getV2AccountTokens',
] as const;

export class AccountsApiService {
  readonly #client: HttpClient;

  constructor(options: AccountsApiServiceOptions = {}) {
    this.#client = new HttpClient(options.baseUrl ?? DEFAULT_BASE_URL, options);
  }

  // ===========================================================================
  // Health & Utility Methods
  // ===========================================================================

  /**
   * Get service metadata
   *
   * @param signal - Optional abort signal
   * @returns Service metadata including product, service name, and version
   */
  async getServiceMetadata(
    signal?: AbortSignal,
  ): Promise<{ product: string; service: string; version: string }> {
    return this.#client.get('/', { signal });
  }

  /**
   * Get service health status
   *
   * @param signal - Optional abort signal
   * @returns Health status
   */
  async getHealth(signal?: AbortSignal): Promise<{ status: string }> {
    return this.#client.get('/health', { signal });
  }

  // ===========================================================================
  // Supported Networks Methods
  // ===========================================================================

  /**
   * Get list of supported networks (v1 endpoint)
   *
   * @param signal - Optional abort signal
   * @returns Supported networks response with supportedNetworks array
   */
  async getV1SupportedNetworks(
    signal?: AbortSignal,
  ): Promise<GetV1SupportedNetworksResponse> {
    return this.#client.get('/v1/supportedNetworks', { signal });
  }

  /**
   * Get list of supported networks (v2 endpoint)
   *
   * Returns networks with full and partial support in CAIP format.
   *
   * @param signal - Optional abort signal
   * @returns Supported networks response with fullSupport and partialSupport
   */
  async getV2SupportedNetworks(
    signal?: AbortSignal,
  ): Promise<GetV2SupportedNetworksResponse> {
    return this.#client.get('/v2/supportedNetworks', { signal });
  }

  // ===========================================================================
  // Active Networks Methods (v2)
  // ===========================================================================

  /**
   * Get active networks by CAIP-10 account IDs (v2 endpoint)
   *
   * Returns the active networks across multiple account IDs.
   *
   * @param accountIds - Array of CAIP-10 account IDs
   * @param options - Optional query parameters
   * @param options.filterMMListTokens - Filter to only tokens in MetaMask's token list
   * @param options.networks - Comma-separated CAIP-2 network IDs to filter by
   * @param signal - Optional abort signal
   * @returns Active networks for the accounts
   *
   * @example
   * ```typescript
   * const active = await accountsApi.getV2ActiveNetworks([
   *   'eip155:1:0xab16a96D359eC26a11e2C2b3d8f8B8942d5Bfcdb',
   *   'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:7S3P4HxJpyyigGzodYwHtCxZyUQe9JiBMHyRWXArAaKv',
   * ]);
   * ```
   */
  async getV2ActiveNetworks(
    accountIds: string[],
    options?: {
      filterMMListTokens?: boolean;
      networks?: string[];
    },
    signal?: AbortSignal,
  ): Promise<GetV2ActiveNetworksResponse> {
    const params = new URLSearchParams();

    if (accountIds.length > 0) {
      params.append('accountIds', accountIds.join(','));
    }
    if (options?.filterMMListTokens !== undefined) {
      params.append('filterMMListTokens', String(options.filterMMListTokens));
    }
    if (options?.networks && options.networks.length > 0) {
      params.append('networks', options.networks.join(','));
    }

    const queryString = params.toString();
    return this.#client.get(
      `/v2/activeNetworks${queryString ? `?${queryString}` : ''}`,
      { signal, authenticate: true },
    );
  }

  // ===========================================================================
  // Balance Methods (v2)
  // ===========================================================================

  /**
   * Get account balances for a single address (v2 endpoint)
   *
   * Returns balances across multiple networks.
   *
   * @param options - Balance request options
   * @param signal - Optional abort signal
   * @returns Account balances response
   */
  async getV2Balances(
    options: GetBalancesOptions,
    signal?: AbortSignal,
  ): Promise<GetV2BalancesResponse> {
    const { address, networks } = options;

    const params = new URLSearchParams();
    if (networks && networks.length > 0) {
      params.append('networks', networks.join(','));
    }

    const queryString = params.toString();
    const path = `/v2/accounts/${address}/balances${queryString ? `?${queryString}` : ''}`;

    return this.#client.get(path, { signal, authenticate: true });
  }

  /**
   * Get account balances with additional options (v2 endpoint)
   *
   * @param address - Account address
   * @param options - Query options
   * @param options.networks - Network IDs to filter by
   * @param options.filterSupportedTokens - Filter to only supported tokens
   * @param options.includeTokenAddresses - Specific token addresses to include
   * @param options.includeStakedAssets - Whether to include staked assets
   * @param signal - Optional abort signal
   * @returns Account balances response
   */
  async getV2BalancesWithOptions(
    address: string,
    options?: {
      networks?: number[];
      filterSupportedTokens?: boolean;
      includeTokenAddresses?: string[];
      includeStakedAssets?: boolean;
    },
    signal?: AbortSignal,
  ): Promise<GetV2BalancesResponse> {
    const params = new URLSearchParams();

    if (options?.networks && options.networks.length > 0) {
      params.append('networks', options.networks.join(','));
    }
    if (options?.filterSupportedTokens !== undefined) {
      params.append(
        'filterSupportedTokens',
        String(options.filterSupportedTokens),
      );
    }
    if (
      options?.includeTokenAddresses &&
      options.includeTokenAddresses.length > 0
    ) {
      params.append(
        'includeTokenAddresses',
        options.includeTokenAddresses.join(','),
      );
    }
    if (options?.includeStakedAssets !== undefined) {
      params.append('includeStakedAssets', String(options.includeStakedAssets));
    }

    const queryString = params.toString();
    return this.#client.get(
      `/v2/accounts/${address}/balances${queryString ? `?${queryString}` : ''}`,
      { signal, authenticate: true },
    );
  }

  // ===========================================================================
  // Multi-Account Balance Methods (v4)
  // ===========================================================================

  /**
   * Get balances for multiple accounts across multiple networks (v4 endpoint)
   *
   * Uses simple account addresses.
   *
   * @param options - Multi-account balance request options
   * @param signal - Optional abort signal
   * @returns Multi-account balances response
   */
  async getV4MultiAccountBalances(
    options: GetMultiAccountBalancesOptions,
    signal?: AbortSignal,
  ): Promise<GetV4MultiAccountBalancesResponse> {
    const { accountAddresses, networks } = options;

    const params = new URLSearchParams();
    params.append('accountAddresses', accountAddresses.join(','));

    if (networks && networks.length > 0) {
      params.append('networks', networks.join(','));
    }

    return this.#client.get(`/v4/multiaccount/balances?${params.toString()}`, {
      signal,
      authenticate: true,
    });
  }

  /**
   * Get balances for multiple accounts using CAIP-10 account IDs (v5 endpoint)
   *
   * Uses CAIP-10 account IDs (e.g., 'eip155:1:0x...') for cross-chain support.
   *
   * @param accountIds - Array of CAIP-10 account IDs
   * @param options - Optional query parameters
   * @param options.filterMMListTokens - Filter to only tokens in MetaMask's token list
   * @param options.networks - Comma-separated CAIP-2 network IDs to filter by
   * @param options.includeStakedAssets - Include staked asset balances
   * @param signal - Optional abort signal
   * @returns Multi-account balances response
   *
   * @example
   * ```typescript
   * const balances = await accountsApi.getV5MultiAccountBalances([
   *   'eip155:1:0xab16a96D359eC26a11e2C2b3d8f8B8942d5Bfcdb',
   *   'eip155:137:0xab16a96D359eC26a11e2C2b3d8f8B8942d5Bfcdb',
   *   'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:7S3P4HxJpyyigGzodYwHtCxZyUQe9JiBMHyRWXArAaKv',
   * ]);
   * ```
   */
  async getV5MultiAccountBalances(
    accountIds: string[],
    options?: {
      /** Filter to only tokens in MetaMask's token list */
      filterMMListTokens?: boolean;
      /** Comma-separated CAIP-2 network IDs to filter by */
      networks?: string[];
      /** Include staked asset balances */
      includeStakedAssets?: boolean;
    },
    signal?: AbortSignal,
  ): Promise<GetV5MultiAccountBalancesResponse> {
    const params = new URLSearchParams();
    params.append('accountIds', accountIds.join(','));

    if (options?.filterMMListTokens !== undefined) {
      params.append('filterMMListTokens', String(options.filterMMListTokens));
    }
    if (options?.networks && options.networks.length > 0) {
      params.append('networks', options.networks.join(','));
    }
    if (options?.includeStakedAssets !== undefined) {
      params.append('includeStakedAssets', String(options.includeStakedAssets));
    }

    return this.#client.get(`/v5/multiaccount/balances?${params.toString()}`, {
      signal,
      authenticate: true,
    });
  }

  // ===========================================================================
  // Transaction Methods
  // ===========================================================================

  /**
   * Get a specific transaction by hash (v1 endpoint)
   *
   * @param chainId - Chain ID (decimal)
   * @param txHash - Transaction hash
   * @param options - Query options
   * @param options.includeLogs - Whether to include transaction logs
   * @param options.includeValueTransfers - Whether to include value transfers
   * @param options.includeTxMetadata - Whether to include transaction metadata
   * @param options.lang - Language for response
   * @param signal - Optional abort signal
   * @returns Transaction details
   */
  async getV1TransactionByHash(
    chainId: number,
    txHash: string,
    options?: {
      includeLogs?: boolean;
      includeValueTransfers?: boolean;
      includeTxMetadata?: boolean;
      lang?: string;
    },
    signal?: AbortSignal,
  ): Promise<TransactionByHashResponse> {
    const params = new URLSearchParams();

    if (options?.includeLogs !== undefined) {
      params.append('includeLogs', String(options.includeLogs));
    }
    if (options?.includeValueTransfers !== undefined) {
      params.append(
        'includeValueTransfers',
        String(options.includeValueTransfers),
      );
    }
    if (options?.includeTxMetadata !== undefined) {
      params.append('includeTxMetadata', String(options.includeTxMetadata));
    }
    if (options?.lang) {
      params.append('lang', options.lang);
    }

    const queryString = params.toString();
    return this.#client.get(
      `/v1/networks/${chainId}/transactions/${txHash}${queryString ? `?${queryString}` : ''}`,
      { signal },
    );
  }

  /**
   * Get account transactions (v1 endpoint)
   *
   * Returns transactions across multiple networks.
   *
   * @param options - Transaction request options
   * @param signal - Optional abort signal
   * @returns Account transactions response
   */
  async getV1AccountTransactions(
    options: GetAccountTransactionsOptions,
    signal?: AbortSignal,
  ): Promise<GetAccountTransactionsResponse> {
    const {
      address,
      chainIds,
      cursor,
      startTimestamp,
      endTimestamp,
      sortDirection,
    } = options;

    const params = new URLSearchParams();

    if (chainIds && chainIds.length > 0) {
      params.append('networks', chainIds.join(','));
    }
    if (cursor) {
      params.append('cursor', cursor);
    }
    if (startTimestamp !== undefined) {
      params.append('startTimestamp', String(startTimestamp));
    }
    if (endTimestamp !== undefined) {
      params.append('endTimestamp', String(endTimestamp));
    }
    if (sortDirection) {
      params.append('sortDirection', sortDirection);
    }

    const queryString = params.toString();
    const path = `/v1/accounts/${address}/transactions${queryString ? `?${queryString}` : ''}`;

    return this.#client.get(path, { signal, authenticate: true });
  }

  /**
   * Get all account transactions with automatic pagination (v1 endpoint)
   *
   * @param options - Transaction request options
   * @param signal - Optional abort signal
   * @returns Array of all transactions
   */
  async getAllV1AccountTransactions(
    options: Omit<GetAccountTransactionsOptions, 'cursor'>,
    signal?: AbortSignal,
  ): Promise<GetAccountTransactionsResponse['data']> {
    const allTransactions: GetAccountTransactionsResponse['data'] = [];
    let cursor: string | undefined;

    do {
      const response = await this.getV1AccountTransactions(
        { ...options, cursor },
        signal,
      );

      allTransactions.push(...response.data);

      cursor = response.pageInfo.hasNextPage
        ? response.pageInfo.cursor
        : undefined;
    } while (cursor);

    return allTransactions;
  }

  /**
   * Get multi-account transactions (v4 endpoint)
   *
   * Returns transactions across multiple accounts and networks.
   *
   * @param accountIds - Array of CAIP-10 account IDs
   * @param options - Query options
   * @param options.networks - CAIP-2 network IDs to filter by
   * @param options.cursor - Pagination cursor
   * @param options.sortDirection - Sort direction (ASC or DESC)
   * @param options.includeLogs - Whether to include transaction logs
   * @param options.includeValueTransfers - Whether to include value transfers
   * @param options.includeTxMetadata - Whether to include transaction metadata
   * @param signal - Optional abort signal
   * @returns Multi-account transactions response
   */
  async getV4MultiAccountTransactions(
    accountIds: string[],
    options?: {
      networks?: string[];
      cursor?: string;
      sortDirection?: 'ASC' | 'DESC';
      includeLogs?: boolean;
      includeValueTransfers?: boolean;
      includeTxMetadata?: boolean;
    },
    signal?: AbortSignal,
  ): Promise<GetV4MultiAccountTransactionsResponse> {
    const params = new URLSearchParams();
    params.append('accountIds', accountIds.join(','));

    if (options?.networks && options.networks.length > 0) {
      params.append('networks', options.networks.join(','));
    }
    if (options?.cursor) {
      params.append('cursor', options.cursor);
    }
    if (options?.sortDirection) {
      params.append('sortDirection', options.sortDirection);
    }
    if (options?.includeLogs !== undefined) {
      params.append('includeLogs', String(options.includeLogs));
    }
    if (options?.includeValueTransfers !== undefined) {
      params.append(
        'includeValueTransfers',
        String(options.includeValueTransfers),
      );
    }
    if (options?.includeTxMetadata !== undefined) {
      params.append('includeTxMetadata', String(options.includeTxMetadata));
    }

    return this.#client.get(
      `/v4/multiaccount/transactions?${params.toString()}`,
      { signal, authenticate: true },
    );
  }

  // ===========================================================================
  // Address Relationship Methods (v1)
  // ===========================================================================

  /**
   * Get account address relationship (v1 endpoint)
   *
   * Returns the most recent transaction from accountAddress to relationshipAddress.
   * Used for first-time interaction check.
   *
   * @param options - Relationship request options
   * @param signal - Optional abort signal
   * @returns Relationship result with transaction details
   */
  async getV1AccountRelationship(
    options: GetAccountRelationshipOptions,
    signal?: AbortSignal,
  ): Promise<AccountRelationshipResult> {
    const { chainId, from, to } = options;

    const path = `/v1/networks/${chainId}/accounts/${from}/relationships/${to}`;

    try {
      const result = await this.#client.get<AccountRelationshipResult>(path, {
        signal,
      });

      return result;
    } catch (error) {
      // Handle API-level errors
      if (
        error instanceof Error &&
        'body' in error &&
        typeof (
          error as { body?: { error?: { code: string; message: string } } }
        ).body === 'object'
      ) {
        const { body } = error as {
          body?: { error?: { code: string; message: string } };
        };
        if (body?.error) {
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
  }

  // ===========================================================================
  // NFT Methods (v2)
  // ===========================================================================

  /**
   * Get NFTs owned by an account (v2 endpoint)
   *
   * @param address - Account address
   * @param options - Optional query options
   * @param options.networks - Network IDs to filter by
   * @param options.cursor - Pagination cursor
   * @param signal - Optional abort signal
   * @returns NFTs response with pagination
   */
  async getV2AccountNfts(
    address: string,
    options?: { networks?: number[]; cursor?: string },
    signal?: AbortSignal,
  ): Promise<{
    data: {
      tokenId: string;
      contractAddress: string;
      chainId: number;
      name?: string;
      description?: string;
      imageUrl?: string;
      attributes?: Record<string, unknown>[];
    }[];
    pageInfo: { count: number; hasNextPage: boolean; cursor?: string };
  }> {
    const params = new URLSearchParams();

    if (options?.networks && options.networks.length > 0) {
      params.append('networks', options.networks.join(','));
    }
    if (options?.cursor) {
      params.append('cursor', options.cursor);
    }

    const queryString = params.toString();
    const path = `/v2/accounts/${address}/nfts${queryString ? `?${queryString}` : ''}`;

    return this.#client.get(path, { signal, authenticate: true });
  }

  // ===========================================================================
  // Token Discovery Methods (v2)
  // ===========================================================================

  /**
   * Get ERC20 tokens detected for an account (v2 endpoint)
   *
   * @param address - Account address
   * @param options - Optional query options
   * @param options.networks - Network IDs to filter by
   * @param signal - Optional abort signal
   * @returns Detected tokens for the account
   */
  async getV2AccountTokens(
    address: string,
    options?: { networks?: number[] },
    signal?: AbortSignal,
  ): Promise<{
    data: {
      address: string;
      chainId: number;
      symbol: string;
      name: string;
      decimals: number;
      balance?: string;
    }[];
  }> {
    const params = new URLSearchParams();

    if (options?.networks && options.networks.length > 0) {
      params.append('networks', options.networks.join(','));
    }

    const queryString = params.toString();
    const path = `/v2/accounts/${address}/tokens${queryString ? `?${queryString}` : ''}`;

    return this.#client.get(path, { signal, authenticate: true });
  }
}
