/* istanbul ignore file */ // We use this file mainly to ease testing of performance logging, so we don't need to cover it with tests.

/**
 * Returns the current high-resolution timestamp in milliseconds. This is a thin wrapper around `performance.now()`.
 *
 * @returns The current high-resolution timestamp in milliseconds.
 */
export function now(): number {
  return performance.now();
}
