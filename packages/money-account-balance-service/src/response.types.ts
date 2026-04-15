/**
 * Response from {@link MoneyAccountBalanceService.getExchangeRate}.
 * Rate is the raw uint256 string returned by the Accountant's `getRate()`.
 */
export type ExchangeRateResponse = {
  rate: string;
};

/**
 * Response from {@link MoneyAccountBalanceService.getMusdEquivalentValue}.
 * All values are raw uint256 strings. The `musdEquivalentValue` is
 * `musdSHFvdBalance * exchangeRate / 10^underlyingTokenDecimals` (= 1e6 for mUSD).
 */
export type MusdEquivalentValueResponse = {
  musdSHFvdBalance: string;
  exchangeRate: string;
  musdEquivalentValue: string;
};

/**
 * Response from {@link MoneyAccountBalanceService.getVaultApy}.
 * All APY / fee values are decimals (multiply by 100 for percentage).
 *
 * Only `apy` and `timestamp` are guaranteed to be present — all other fields
 * are optional because the Veda API omits them when the vault has no activity.
 */
export type NormalizedVaultApyResponse = {
  aggregationPeriod?: string; // E.g. "7 days"
  apy: number;
  chainAllocation?: {
    [network: string]: number;
  };
  fees?: number;
  globalApyBreakdown?: {
    fee?: number;
    maturityApy?: number;
    realApy?: number;
  };
  performanceFees?: number;
  realApyBreakdown?: {
    allocation?: number;
    apy?: number;
    apyNet?: number;
    chain?: string;
    protocol?: string;
  }[];
  timestamp: string;
};
