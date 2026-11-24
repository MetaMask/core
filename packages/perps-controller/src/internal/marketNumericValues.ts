import type { PerpsMarketNumericValues } from '../types/index.js';

/**
 * Builds `PerpsMarketData.numericValues`, leaving out a value that is not a
 * finite number. Internal: not exported from the package.
 *
 * @param values - The unformatted values a market row is displayed from.
 * @returns The values that are finite numbers.
 */
export const buildMarketNumericValues = (
  values: Record<keyof PerpsMarketNumericValues, number | undefined>,
): PerpsMarketNumericValues =>
  Object.fromEntries(
    Object.entries(values).filter(
      ([, value]) => value !== undefined && Number.isFinite(value),
    ),
  );
