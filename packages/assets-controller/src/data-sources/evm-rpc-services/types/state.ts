import type { Address, ChainId } from './core';

/**
 * Single token entry from token list.
 */
export type TokenListEntry = {
  /** Contract address */
  address: Address;
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
  data: Record<Address, TokenListEntry>;
};

/**
 * Token list state shape (from TokenListController).
 */
export type TokenListState = {
  /** Map of chain ID to token list cache entry */
  tokensChainsCache: Record<ChainId, TokenChainsCacheEntry>;
};

/**
 * Token entry from user's imported/detected tokens.
 */
export type UserToken = {
  /** Contract address */
  address: Address;
  /** Token symbol */
  symbol: string;
  /** Token name */
  name?: string;
  /** Token decimals */
  decimals: number;
  /** Logo URL */
  image?: string;
  /** Whether token was auto-detected */
  isERC721?: boolean;
  /** Aggregator sources */
  aggregators?: string[];
};

/**
 * User tokens state shape (from TokensController).
 */
export type UserTokensState = {
  /** All imported tokens: chainId -> accountAddress -> Token[] */
  allTokens: Record<ChainId, Record<Address, UserToken[]>>;
  /** All detected tokens: chainId -> accountAddress -> Token[] */
  allDetectedTokens: Record<ChainId, Record<Address, UserToken[]>>;
  /** Ignored tokens: chainId -> address[] */
  allIgnoredTokens: Record<ChainId, Record<Address, Address[]>>;
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
