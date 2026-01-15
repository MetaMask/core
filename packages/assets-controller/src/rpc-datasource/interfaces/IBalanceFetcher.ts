import type {
  AccountId,
  Address,
  AssetBalance,
  ChainId,
  UserTokensState,
} from '../types';

/**
 * Balance fetch result.
 */
export type BalanceFetchResult = {
  /** Chain ID */
  chainId: ChainId;
  /** Account ID */
  accountId: AccountId;
  /** Account address */
  accountAddress: Address;
  /** Fetched balances */
  balances: AssetBalance[];
  /** Token addresses that failed to fetch */
  failedAddresses: Address[];
  /** Block number when balances were fetched */
  blockNumber?: number;
  /** Timestamp of fetch */
  timestamp: number;
};

/**
 * Balance fetch options.
 */
export type BalanceFetchOptions = {
  /** Maximum number of tokens to fetch per batch */
  batchSize?: number;
  /** Timeout for fetch in milliseconds */
  timeout?: number;
  /** Include native token balance */
  includeNative?: boolean;
  /** Include staked balance (if supported) */
  includeStaked?: boolean;
};

/**
 * Balance fetcher interface.
 *
 * Responsible for fetching token balances for an account's
 * imported and detected tokens using Multicall3.
 */
export type IBalanceFetcher = {
  /**
   * Fetch balances for all known tokens of an account on a chain.
   *
   * Uses the user's imported + detected tokens list and
   * Multicall3 to batch balanceOf calls.
   *
   * @param chainId - Chain ID to fetch balances on.
   * @param accountId - Account ID to fetch balances for.
   * @param accountAddress - Account address to check balances for.
   * @param options - Optional fetch options.
   * @returns Fetch result with balances.
   */
  fetchBalances(
    chainId: ChainId,
    accountId: AccountId,
    accountAddress: Address,
    options?: BalanceFetchOptions,
  ): Promise<BalanceFetchResult>;

  /**
   * Fetch balance for specific token addresses.
   *
   * @param chainId - Chain ID.
   * @param accountAddress - Account address.
   * @param tokenAddresses - Specific token addresses to fetch.
   * @param options - Optional fetch options.
   * @returns Fetch result with balances.
   */
  fetchBalancesForTokens(
    chainId: ChainId,
    accountId: AccountId,
    accountAddress: Address,
    tokenAddresses: Address[],
    options?: BalanceFetchOptions,
  ): Promise<BalanceFetchResult>;

  /**
   * Get token addresses to fetch from user's state.
   *
   * @param chainId - Chain ID.
   * @param accountAddress - Account address.
   * @returns Array of token addresses to fetch.
   */
  getTokensToFetch(chainId: ChainId, accountAddress: Address): Address[];

  /**
   * Set the user tokens state source.
   *
   * @param getUserTokensState - Function to get current user tokens state.
   */
  setUserTokensStateGetter(getUserTokensState: () => UserTokensState): void;
};
