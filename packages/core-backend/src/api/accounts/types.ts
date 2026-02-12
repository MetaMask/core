/**
 * Accounts API types for the API Platform Client.
 * API: accounts.api.cx.metamask.io
 */

import type { PageInfo } from '../shared-types';

// ============================================================================
// BALANCE TYPES
// ============================================================================

/** V5 Balance Item from Accounts API */
export type V5BalanceItem = {
  object: 'token';
  symbol: string;
  name: string;
  type: 'native' | 'erc20';
  decimals: number;
  assetId: string;
  balance: string;
  accountId: string;
};

/** V5 Multi-account balances response */
export type V5BalancesResponse = {
  count: number;
  unprocessedNetworks: string[];
  balances: V5BalanceItem[];
};

/** V2 Balance item */
export type V2BalanceItem = {
  object: string;
  type?: string;
  timestamp?: string;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  chainId: number;
  balance: string;
  accountAddress?: string;
};

/** V2 Balances response */
export type V2BalancesResponse = {
  count: number;
  balances: V2BalanceItem[];
  unprocessedNetworks: number[];
};

/** V4 Multi-account balances response */
export type V4BalancesResponse = {
  count: number;
  balances: V2BalanceItem[];
  unprocessedNetworks: number[];
};

// ============================================================================
// SUPPORTED NETWORKS TYPES
// ============================================================================

/** V1 Supported networks response */
export type V1SupportedNetworksResponse = {
  supportedNetworks: number[];
};

/** V2 Supported networks response */
export type V2SupportedNetworksResponse = {
  fullSupport: number[];
  partialSupport: {
    balances: number[];
  };
};

/** Active networks response */
export type V2ActiveNetworksResponse = {
  activeNetworks: string[];
};

// ============================================================================
// TRANSACTION TYPES
// ============================================================================

/** Transaction by hash response */
export type V1TransactionByHashResponse = {
  hash: string;
  timestamp: string;
  chainId: number;
  blockNumber: number;
  blockHash: string;
  gas: number;
  gasUsed: number;
  gasPrice: string;
  effectiveGasPrice: string;
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

/** Account transactions response */
export type V1AccountTransactionsResponse = {
  data: V1TransactionByHashResponse[];
  pageInfo: PageInfo;
};

/** V4 Multi-account transactions response */
export type V4MultiAccountTransactionsResponse = {
  unprocessedNetworks: string[];
  pageInfo: {
    count: number;
    hasNextPage: boolean;
    endCursor?: string;
  };
  data: V1TransactionByHashResponse[];
};

// ============================================================================
// RELATIONSHIP TYPES
// ============================================================================

/**
 * Value transfer within a transaction
 */
export type ValueTransfer = {
  from: string;
  to: string;
  amount: string;
  decimal: number;
  transferType: string;
};

/**
 * Account address relationship result from v1 endpoint
 */
export type V1AccountRelationshipResult = {
  /** Transaction hash of the relationship */
  txHash?: string;
  /** Chain ID */
  chainId?: number;
  /** Number of interactions */
  count?: number;
  /** Transaction data details */
  data?: {
    hash: string;
    timestamp: string;
    chainId: number;
    blockNumber: number;
    blockHash: string;
    gas: number;
    gasUsed: number;
    gasPrice: string;
    effectiveGasPrice: string;
    nonce: number;
    cumulativeGasUsed: number;
    methodId: string;
    value: string;
    to: string;
    from: string;
    isError: boolean;
    valueTransfers: ValueTransfer[];
    logs: unknown[];
    transactionType: string;
    transactionCategory: string;
    readable: string;
    textFunctionSignature: string;
  };
  /** Error information when relationship lookup fails */
  error?: {
    code: string;
    message: string;
  };
};

// ============================================================================
// NFT TYPES
// ============================================================================

/** NFT item */
export type NftItem = {
  tokenId: string;
  contractAddress: string;
  chainId: number;
  name?: string;
  description?: string;
  imageUrl?: string;
  attributes?: Record<string, unknown>[];
};

/** NFTs response */
export type V2NftsResponse = {
  data: NftItem[];
  pageInfo: PageInfo;
};

// ============================================================================
// TOKEN DISCOVERY TYPES
// ============================================================================

/** Token discovery item */
export type TokenDiscoveryItem = {
  address: string;
  chainId: number;
  symbol: string;
  name: string;
  decimals: number;
  balance?: string;
};

/** Tokens response */
export type V2TokensResponse = {
  data: TokenDiscoveryItem[];
};
