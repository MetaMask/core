// TODO: Determine if this is necessary. See if other existing data services have similar type definitions.
// TODO: Validate if types are accurate.
/**
 * Response from {@link MoneyAccountBalanceService.getMusdBalance}.
 * Balance is a raw uint256 string (no decimal normalization).
 */
export type MusdBalanceResponse = {
  balance: string;
};

/**
 * Response from {@link MoneyAccountBalanceService.getMusdSHFvdBalance}.
 * Balance is a raw uint256 string (no decimal normalization).
 */
export type MusdSHFvdBalanceResponse = {
  balance: string;
};

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
 * `musdSHFvdBalance * exchangeRate / 1e18`.
 */
export type MusdEquivalentValueResponse = {
  musdSHFvdBalance: string;
  exchangeRate: string;
  musdEquivalentValue: string;
};

/**
 * Per-position APY entry from the Veda performance API's
 * `global_apy_breakdown.real_apy_breakdown` array.
 */
export type VaultApyBreakdownEntry = {
  category: string;
  apy: number;
  allocation: number;
};

/**
 * Response from {@link MoneyAccountBalanceService.getVaultApy}.
 * All APY / fee values are decimals (multiply by 100 for percentage).
 */
export type VaultApyResponse = {
  apy: number;
  fees: number;
  performanceFees: number;
  apyBreakdown: VaultApyBreakdownEntry[];
};
