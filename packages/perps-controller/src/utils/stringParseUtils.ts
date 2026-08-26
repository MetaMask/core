export const stripQuotes = (str: string): string => {
  let result = str;
  while (
    (result.startsWith('"') && result.endsWith('"')) ||
    (result.startsWith("'") && result.endsWith("'"))
  ) {
    result = result.slice(1, -1);
  }
  return result;
};

export const parseCommaSeparatedString = (value: string): string[] =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

const NON_NEGATIVE_DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/u;

/**
 * Parse a plain non-negative decimal within an inclusive upper bound.
 *
 * @param value - Candidate decimal string.
 * @param upperBound - Largest accepted value.
 * @returns The parsed value, or null when the input is invalid or too large.
 */
export function parseBoundedNonNegativeDecimal(
  value: unknown,
  upperBound = Number.MAX_VALUE,
): number | null {
  if (typeof value !== 'string' || !NON_NEGATIVE_DECIMAL_PATTERN.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed <= upperBound ? parsed : null;
}

/**
 * Parse a plain positive decimal within an inclusive upper bound.
 *
 * @param value - Candidate decimal string.
 * @param upperBound - Largest accepted value.
 * @returns The parsed value, or null when the input is invalid, zero, or too large.
 */
export function parseBoundedPositiveDecimal(
  value: unknown,
  upperBound = Number.MAX_VALUE,
): number | null {
  const parsed = parseBoundedNonNegativeDecimal(value, upperBound);
  return parsed !== null && parsed > 0 ? parsed : null;
}
