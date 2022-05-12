/**
 * A millisecond.
 */
export const MILLISECOND = 1;

/**
 * A second, in milliseconds.
 */
export const SECOND = 1000; // MILLISECOND * 1000

/**
 * A minute, in milliseconds.
 */
export const MINUTE = 60_000; // SECOND * 60

/**
 * An hour, in milliseconds.
 */
export const HOUR = 3_600_000; // MINUTE * 60

/**
 * A day, in milliseconds.
 */
export const DAY = 86_400_000; // HOUR * 24

/**
 * Gets the milliseconds since a particular Unix epoch timestamp.
 *
 * @param timestamp - A Unix millisecond timestamp.
 * @returns The number of milliseconds elapsed since the specified timestamp.
 */
export function timeSince(timestamp: number): number {
  return Date.now() - timestamp;
}
