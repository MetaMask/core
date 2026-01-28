/**
 * Account utilities for Perps components
 * Handles account-related calculations.
 *
 * Note: This file contains only platform-agnostic (pure) functions
 * that can be used in the core monorepo.
 */

/**
 * Interface for ROE calculation input
 */
export type ReturnOnEquityInput = {
  unrealizedPnl: string | number;
  returnOnEquity: string | number;
};

/**
 * Calculates weighted return on equity across multiple account states
 * Weights each account's ROE by its margin used (derived from unrealizedPnl and returnOnEquity)
 *
 * Formula: weightedROE = Sum(ROE_i * marginUsed_i) / Sum(marginUsed_i)
 * where marginUsed_i is derived as: (unrealizedPnl_i / returnOnEquity_i) * 100
 *
 * @param accounts - Array of account states with unrealizedPnl and returnOnEquity
 * @returns Weighted return on equity as a string with 1 decimal place, or '0' if no margin used
 */
export function calculateWeightedReturnOnEquity(
  accounts: ReturnOnEquityInput[],
): string {
  if (accounts.length === 0) {
    return '0';
  }

  let totalWeightedROE = 0;
  let totalMarginUsed = 0;

  for (const account of accounts) {
    const unrealizedPnl =
      typeof account.unrealizedPnl === 'string'
        ? Number.parseFloat(account.unrealizedPnl)
        : account.unrealizedPnl;
    const returnOnEquity =
      typeof account.returnOnEquity === 'string'
        ? Number.parseFloat(account.returnOnEquity)
        : account.returnOnEquity;

    // Skip invalid values
    if (Number.isNaN(unrealizedPnl) || Number.isNaN(returnOnEquity)) {
      continue;
    }

    // Derive marginUsed from unrealizedPnl and returnOnEquity
    // If returnOnEquity is 0, we can't derive marginUsed, so skip this account
    if (returnOnEquity === 0) {
      // If both are 0, marginUsed could be anything, so we skip it
      // If unrealizedPnl != 0 but returnOnEquity == 0, this is an error case, skip it
      continue;
    }

    // marginUsed = (unrealizedPnl / returnOnEquity) * 100
    const marginUsed = (unrealizedPnl / returnOnEquity) * 100;

    // Skip invalid or zero margin accounts
    if (Number.isNaN(marginUsed) || marginUsed <= 0) {
      continue;
    }

    // Convert ROE from percentage to decimal for calculation
    const roeDecimal = returnOnEquity / 100;

    // Weight the ROE by margin used
    totalWeightedROE += roeDecimal * marginUsed;
    totalMarginUsed += marginUsed;
  }

  if (totalMarginUsed <= 0) {
    return '0';
  }

  // Calculate weighted average and convert back to percentage
  const weightedROE = (totalWeightedROE / totalMarginUsed) * 100;
  return weightedROE.toFixed(1);
}
