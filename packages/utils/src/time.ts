export type Duration =
  | 'millisecond'
  | 'second'
  | 'minute'
  | 'hour'
  | 'day'
  | 'week'
  | 'year';

const MILLISECOND_DURATIONS: Record<Duration, number> = {
  millisecond: 1,
  second: 1000,
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 604_800_000,
  year: 31_536_000_000,
};

const isNonNegativeInteger = (number: number): boolean =>
  Number.isInteger(number) && number >= 0;

const assertIsNonNegativeInteger = (number: number, name: string): void => {
  if (!isNonNegativeInteger(number)) {
    throw new Error(
      `"${name}" must be a non-negative integer. Received: "${number}".`,
    );
  }
};

/**
 * Calculates the millisecond value of the specified number of units of time.
 *
 * @param count - The number of units of time.
 * @param duration - The unit of time to count.
 * @returns The count multiplied by the specified duration.
 */
export function inMilliseconds(count: number, duration: Duration): number {
  assertIsNonNegativeInteger(count, 'count');
  return count * MILLISECOND_DURATIONS[duration];
}

/**
 * Gets the milliseconds since a particular Unix epoch timestamp.
 *
 * @param timestamp - A Unix millisecond timestamp.
 * @returns The number of milliseconds elapsed since the specified timestamp.
 */
export function timeSince(timestamp: number): number {
  assertIsNonNegativeInteger(timestamp, 'timestamp');
  return Date.now() - timestamp;
}
