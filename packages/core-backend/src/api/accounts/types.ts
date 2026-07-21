/**
 * Accounts API types for the API Platform Client.
 * API: accounts.api.cx.metamask.io
 */

import type { PageInfo } from '../shared-types.js';

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

/**
 * Quote currency accepted by the v6 balances endpoint when `includePrices` is
 * true. A superset of {@link SupportedCurrency} (adds e.g. `sol`, `xdr`,
 * `xag`, `xau`, `bits`, `sats`). Defaults to `usd`.
 */
export type V6VsCurrency = string;

/**
 * DeFi protocol metadata attached to a `category: defi` row in the v6 balances
 * response (`BalanceMetadataV3ResponseDto`).
 */
export type V6BalanceMetadata = {
  protocolId: string;
  protocolName: string;
  description: string;
  protocolUrl: string;
  protocolIconUrl: string;
  positionType: string;
  poolAddress: string;
};

/**
 * Token-level metadata attached to a `category: token` row in the v6 balances
 * response, e.g. Stellar trustline metadata. Additional keys may be present.
 */
export type V6TokenMetadata = {
  /** Stellar trustline limit. */
  limit?: string;
  /** Whether the Stellar trustline is authorized. */
  authorized?: boolean;
  [key: string]: unknown;
};

/**
 * A single balance row in the v6 balances response (`BalanceV3ResponseDto`).
 * `category: token` rows are EVM/Solana token balances (and may carry
 * {@link V6TokenMetadata}, e.g. Stellar trustline info). `category: defi` rows
 * are flat DeFi positions and include {@link V6BalanceMetadata}.
 */
export type V6BalanceItem = {
  category: 'token' | 'defi';
  assetId: string;
  name: string;
  symbol: string;
  decimals: number;
  balance: string;
  /** Spot price in the requested `vsCurrency`. Present when `includePrices` is true. */
  price?: string;
  /** Asset metadata labels. Present when `includeLabels` is true. */
  labels?: string[];
  /** Canonical head asset ID. Present when `includeCanonicalHead` is true. */
  canonicalHead?: string;
  /**
   * DeFi protocol metadata for `category: defi` rows; token-level metadata such
   * as Stellar trustline info (e.g. `limit`, `authorized`) for `category: token`
   * rows.
   */
  metadata?: V6BalanceMetadata | V6TokenMetadata;
};

/**
 * A per-account entry in the v6 balances response
 * (`AccountBalancesV3EntryDto`).
 */
export type V6AccountBalancesEntry = {
  accountId: string;
  balances: V6BalanceItem[];
  /**
   * When true, DeFi positions for this account are still being indexed
   * upstream; poll again shortly.
   */
  processingDefiPositions?: boolean;
};

/**
 * V6 multi-account balances response (`MultiAccountBalancesV3ResponseDto`).
 */
export type V6BalancesResponse = {
  /** CAIP-2 networks that could not be processed for this request. */
  unprocessedNetworks: string[];
  /**
   * ERC-20 IDs from `includeAssetIds` that were not detected on any requested
   * account, plus other IDs that still need a client fallback flow.
   */
  unprocessedIncludeAssetIds: string[];
  /** Per-account balance entries. */
  accounts: V6AccountBalancesEntry[];
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
