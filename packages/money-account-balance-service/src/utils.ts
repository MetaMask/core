const DAYS_PER_YEAR = 365;

export function convertAprToApy(apr: undefined): undefined;
export function convertAprToApy(apr: number): number;
export function convertAprToApy(apr: number | undefined): number | undefined;

/**
 * Converts a decimal APR to a decimal APY using daily compounding.
 *
 * @param apr - The APR as a decimal.
 * @returns The compounded APY, or undefined when APR is undefined.
 */
export function convertAprToApy(apr: number | undefined): number | undefined {
  if (apr === undefined || apr === 0) {
    return apr;
  }

  return (1 + apr / DAYS_PER_YEAR) ** DAYS_PER_YEAR - 1;
}
