/**
 * Messenger action types for AccountsApiService
 *
 * Actions are namespaced as: BackendApiClient:Accounts:*
 */

import type {
  GetV2ActiveNetworksResponse,
  TransactionByHashResponse,
  GetV4MultiAccountTransactionsResponse,
  GetV5MultiAccountBalancesResponse,
} from './AccountsApiService';
import type {
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

// Using string literals directly in template types to avoid unused variable lint errors
type ServiceName = 'BackendApiClient';
type Namespace = 'Accounts';

// =============================================================================
// Health & Utility Actions
// =============================================================================

export type AccountsGetServiceMetadataAction = {
  type: `${ServiceName}:${Namespace}:getServiceMetadata`;
  handler: () => Promise<{ product: string; service: string; version: string }>;
};

export type AccountsGetHealthAction = {
  type: `${ServiceName}:${Namespace}:getHealth`;
  handler: () => Promise<{ status: string }>;
};

// =============================================================================
// Supported Networks Actions
// =============================================================================

export type AccountsGetV1SupportedNetworksAction = {
  type: `${ServiceName}:${Namespace}:getV1SupportedNetworks`;
  handler: () => Promise<GetV1SupportedNetworksResponse>;
};

export type AccountsGetV2SupportedNetworksAction = {
  type: `${ServiceName}:${Namespace}:getV2SupportedNetworks`;
  handler: () => Promise<GetV2SupportedNetworksResponse>;
};

// =============================================================================
// Active Networks Actions
// =============================================================================

export type AccountsGetV2ActiveNetworksAction = {
  type: `${ServiceName}:${Namespace}:getV2ActiveNetworks`;
  handler: (
    accountIds: string[],
    options?: {
      filterMMListTokens?: boolean;
      networks?: string[];
    },
  ) => Promise<GetV2ActiveNetworksResponse>;
};

// =============================================================================
// Balances Actions (v2 - single address)
// =============================================================================

export type AccountsGetV2BalancesAction = {
  type: `${ServiceName}:${Namespace}:getV2Balances`;
  handler: (options: GetBalancesOptions) => Promise<GetV2BalancesResponse>;
};

export type AccountsGetV2BalancesWithOptionsAction = {
  type: `${ServiceName}:${Namespace}:getV2BalancesWithOptions`;
  handler: (
    address: string,
    options?: {
      networks?: number[];
      filterSupportedTokens?: boolean;
      includeTokenAddresses?: string[];
      includeStakedAssets?: boolean;
    },
  ) => Promise<GetV2BalancesResponse>;
};

// =============================================================================
// Balances Actions (v4 - multi-account with addresses)
// =============================================================================

export type AccountsGetV4MultiAccountBalancesAction = {
  type: `${ServiceName}:${Namespace}:getV4MultiAccountBalances`;
  handler: (
    options: GetMultiAccountBalancesOptions,
  ) => Promise<GetV4MultiAccountBalancesResponse>;
};

// =============================================================================
// Balances Actions (v5 - multi-account with CAIP-10 IDs)
// =============================================================================

export type AccountsGetV5MultiAccountBalancesAction = {
  type: `${ServiceName}:${Namespace}:getV5MultiAccountBalances`;
  handler: (
    accountIds: string[],
    options?: {
      filterMMListTokens?: boolean;
      networks?: string[];
      includeStakedAssets?: boolean;
    },
  ) => Promise<GetV5MultiAccountBalancesResponse>;
};

// =============================================================================
// Transactions Actions
// =============================================================================

export type AccountsGetV1TransactionByHashAction = {
  type: `${ServiceName}:${Namespace}:getV1TransactionByHash`;
  handler: (
    chainId: number,
    txHash: string,
    options?: {
      includeLogs?: boolean;
      includeValueTransfers?: boolean;
      includeTxMetadata?: boolean;
      lang?: string;
    },
  ) => Promise<TransactionByHashResponse>;
};

export type AccountsGetV1AccountTransactionsAction = {
  type: `${ServiceName}:${Namespace}:getV1AccountTransactions`;
  handler: (
    options: GetAccountTransactionsOptions,
  ) => Promise<GetAccountTransactionsResponse>;
};

export type AccountsGetV4MultiAccountTransactionsAction = {
  type: `${ServiceName}:${Namespace}:getV4MultiAccountTransactions`;
  handler: (
    accountIds: string[],
    options?: {
      networks?: string[];
      cursor?: string;
      sortDirection?: 'ASC' | 'DESC';
      includeLogs?: boolean;
      includeValueTransfers?: boolean;
      includeTxMetadata?: boolean;
    },
  ) => Promise<GetV4MultiAccountTransactionsResponse>;
};

// =============================================================================
// Relationships Actions
// =============================================================================

export type AccountsGetV1AccountRelationshipAction = {
  type: `${ServiceName}:${Namespace}:getV1AccountRelationship`;
  handler: (
    options: GetAccountRelationshipOptions,
  ) => Promise<AccountRelationshipResult>;
};

// =============================================================================
// NFT Actions (v2)
// =============================================================================

export type AccountsGetV2AccountNftsAction = {
  type: `${ServiceName}:${Namespace}:getV2AccountNfts`;
  handler: (
    address: string,
    options?: { networks?: number[]; cursor?: string },
  ) => Promise<{
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
  }>;
};

// =============================================================================
// Token Actions (v2)
// =============================================================================

export type AccountsGetV2AccountTokensAction = {
  type: `${ServiceName}:${Namespace}:getV2AccountTokens`;
  handler: (
    address: string,
    options?: { networks?: number[] },
  ) => Promise<{
    data: {
      address: string;
      chainId: number;
      symbol: string;
      name: string;
      decimals: number;
      balance?: string;
    }[];
  }>;
};

// =============================================================================
// All Accounts API Actions
// =============================================================================

export type AccountsApiActions =
  // Health & Utility
  | AccountsGetServiceMetadataAction
  | AccountsGetHealthAction
  // Supported Networks
  | AccountsGetV1SupportedNetworksAction
  | AccountsGetV2SupportedNetworksAction
  // Active Networks
  | AccountsGetV2ActiveNetworksAction
  // Balances (v2 - single address)
  | AccountsGetV2BalancesAction
  | AccountsGetV2BalancesWithOptionsAction
  // Balances (v4 - multi-account with addresses)
  | AccountsGetV4MultiAccountBalancesAction
  // Balances (v5 - multi-account with CAIP-10 IDs)
  | AccountsGetV5MultiAccountBalancesAction
  // Transactions
  | AccountsGetV1TransactionByHashAction
  | AccountsGetV1AccountTransactionsAction
  | AccountsGetV4MultiAccountTransactionsAction
  // Relationships
  | AccountsGetV1AccountRelationshipAction
  // NFTs
  | AccountsGetV2AccountNftsAction
  // Tokens
  | AccountsGetV2AccountTokensAction;
