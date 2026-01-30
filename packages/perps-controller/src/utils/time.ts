/**
 * Time unit configuration for formatting
 */
type TimeUnit = {
  threshold: number;
  singular: string;
  plural: string;
  divisor: number;
};

const TIME_UNITS: TimeUnit[] = [
  { threshold: 3600, singular: 'hour', plural: 'hours', divisor: 3600 },
  { threshold: 60, singular: 'minute', plural: 'minutes', divisor: 60 },
  { threshold: 0, singular: 'second', plural: 'seconds', divisor: 1 },
];

/**
 * Formats a duration in seconds into a human-readable string using the most appropriate unit.
 *
 * The function automatically selects the largest suitable unit (hours, minutes, or seconds)
 * and rounds to the nearest whole number for cleaner display.
 *
 * @param seconds - The duration in seconds to format
 * @returns A formatted string with the appropriate unit (e.g., "30 seconds", "2 minutes", "1 hour")
 *
 * @example
 * formatDurationForDisplay(30)    // "30 seconds"
 * formatDurationForDisplay(90)    // "2 minutes" (rounds 1.5 to 2)
 * formatDurationForDisplay(3600)  // "1 hour"
 * formatDurationForDisplay(5400)  // "2 hours" (rounds 1.5 to 2)
 */
export const formatDurationForDisplay = (seconds: number): string => {
  // Find the appropriate unit based on the duration
  for (const unit of TIME_UNITS) {
    if (seconds >= unit.threshold) {
      const value = Math.round(seconds / unit.divisor);
      const unitName = value === 1 ? unit.singular : unit.plural;
      return `${value} ${unitName}`;
    }
  }

  // Fallback for very small values (should not normally reach here)
  return `${Math.round(seconds)} seconds`;
};
