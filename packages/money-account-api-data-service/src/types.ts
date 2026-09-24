/**
 * Valid time-window values for the interest endpoint.
 */
export type InterestWindow = '24h' | '7d' | '30d' | 'ytd' | 'since_inception';

/**
 * Options for the `fetchInterest` method.
 */
export type InterestOptions = {
  vaultAddress: string;
  window: InterestWindow;
  chainId?: number;
};

/**
 * Options for the `fetchPositions` method.
 */
export type FetchPositionsOptions = {
  /**
   * When true, bypass the client TanStack cache and send
   * `Cache-Control: no-cache` so the Money API also skips its Nest
   * response cache and refreshes the wallet mUSD balance on demand.
   * Intended for post-transaction read-your-writes refreshes.
   */
  fresh?: boolean;
};

/**
 * Options for the `fetchHistory` method.
 */
export type HistoryOptions = {
  vaultAddress?: string;
  chainId?: number;
  cursor?: string;
  limit?: number;
};

/**
 * Options for the `fetchRateHistory` method.
 */
export type RateHistoryOptions = {
  chainId?: number;
  from?: string;
  to?: string;
};
