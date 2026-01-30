/**
 * Strip surrounding quotes from a string (handles both single and double quotes)
 * Use this to clean up values that may have been JSON-encoded with extra quotes
 *
 * @param str - String to strip quotes from
 * @returns String with surrounding quotes removed, or unchanged if no matching quotes
 *
 * @example
 * stripQuotes('"xyz"') // returns "xyz"
 * stripQuotes("'abc'") // returns "abc"
 * stripQuotes('xyz')   // returns "xyz" (unchanged)
 */
export const stripQuotes = (str: string): string => {
  if (
    (str.startsWith('"') && str.endsWith('"')) ||
    (str.startsWith("'") && str.endsWith("'"))
  ) {
    return str.slice(1, -1);
  }
  return str;
};

/**
 * Parse comma-separated string into array of trimmed non-empty values
 * Commonly used for LaunchDarkly feature flag list values
 *
 * Note: This function only handles parsing and trimming. If your values may
 * contain surrounding quotes (e.g., from LaunchDarkly JSON encoding), apply
 * stripQuotes separately: `parseCommaSeparatedString(value).map(stripQuotes)`
 *
 * @param value - Comma-separated string
 * @returns Array of trimmed non-empty strings
 *
 * @example Basic usage
 * parseCommaSeparatedString("xyz:*, abc:TSLA") // returns ["xyz:*", "abc:TSLA"]
 *
 * @example Empty string
 * parseCommaSeparatedString("") // returns []
 *
 * @example Whitespace handling
 * parseCommaSeparatedString("  ,  , xyz  ") // returns ["xyz"]
 */
export const parseCommaSeparatedString = (value: string): string[] =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
