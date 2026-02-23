import type { ChainId } from './core';

/**
 * Single token entry from token list.
 */
export type TokenListEntry = {
  /** Contract address */
  address: string;
  /** Token symbol */
  symbol: string;
  /** Token name */
  name: string;
  /** Token decimals */
  decimals: number;
  /** Logo URL */
  iconUrl?: string;
  /** Aggregator sources */
  aggregators?: string[];
  /** Occurrence count in lists */
  occurrences?: number;
};

/**
 * Cache entry for a chain's token list.
 */
export type TokenChainsCacheEntry = {
  /** Timestamp when the cache was last updated */
  timestamp: number;
  /** Token list data: address -> TokenListEntry */
  data: Record<string, TokenListEntry>;
};

/**
 * Token list state shape (from TokenListController).
 */
export type TokenListState = {
  /** Map of chain ID to token list cache entry */
  tokensChainsCache: Record<ChainId, TokenChainsCacheEntry>;
};

/**
 * Single asset balance entry.
 */
export type AssetBalanceEntry = {
  /** Human-readable balance amount */
  amount: string;
};

/**
 * Assets balance state shape (from AssetsController).
 * Maps accountId -> assetId (CAIP-19) -> balance entry.
 */
export type AssetsBalanceState = {
  /** Balance data per account: accountId -> assetId -> balance */
  assetsBalance: Record<string, Record<string, AssetBalanceEntry>>;
};
