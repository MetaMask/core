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
