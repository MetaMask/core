import type { AccountId, Address, ChainId } from './core';

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
 * Token list state shape (from TokenListController).
 */
export type TokenListState = {
  /** Map of chain ID to token list */
  tokensChainsCache: Record<ChainId, Record<Address, TokenListEntry>>;
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
 * Minimal account info needed for RPC operations.
 */
export type AccountInfo = {
  /** Account UUID */
  id: AccountId;
  /** Account address */
  address: Address;
  /** Account type (e.g., "eip155:eoa") */
  type: string;
};

/**
 * Function to get account info by ID.
 */
export type GetAccountFunction = (
  accountId: AccountId,
) => AccountInfo | undefined;
