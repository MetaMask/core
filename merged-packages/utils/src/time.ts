/**
 * Common duration constants, in milliseconds.
 */
export enum Duration {
  /**
   * A millisecond.
   */
  Millisecond = 1,

  /**
   * A second, in milliseconds.
   */
  Second = 1000, // Millisecond * 1000

  /**
   * A minute, in milliseconds.
   */
  Minute = 60_000, // Second * 60

  /**
   * An hour, in milliseconds.
   */
  Hour = 3_600_000, // Minute * 60

  /**
   * A day, in milliseconds.
   */
  Day = 86_400_000, // Hour * 24

  /**
   * A week, in milliseconds.
   */
  Week = 604_800_000, // Day * 7

  /**
   * A year, in milliseconds.
   */
  Year = 31_536_000_000, // Day * 365
}

const isNonNegativeInteger = (number: number) =>
  Number.isInteger(number) && number >= 0;

const assertIsNonNegativeInteger = (number: number, name: string) => {
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
  return count * duration;
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
