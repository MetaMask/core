import type { AnalyticsControllerState } from './AnalyticsController';

/**
 * UUIDv4 format regex pattern.
 * Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 * - x is any hexadecimal digit [0-9a-f]
 * - 4 indicates UUID version 4
 * - y is the variant indicator [89ab]
 */
const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/**
 * Validates that a string is a valid UUIDv4 format.
 *
 * @param value - The string to validate
 * @returns True if the string matches UUIDv4 format
 */
export function isValidUUIDv4(value: string): boolean {
  return typeof value === 'string' && UUID_V4_REGEX.test(value);
}

/**
 * Validates that the analytics state has a valid UUIDv4 analyticsId.
 *
 * @param state - The analytics controller state to validate
 * @throws Error if analyticsId is missing or not a valid UUIDv4
 */
export function validateAnalyticsControllerState(
  state: AnalyticsControllerState,
): void {
  if (!state.analyticsId || !isValidUUIDv4(state.analyticsId)) {
    throw new Error(
      `Invalid analyticsId: expected a valid UUIDv4, but got ${JSON.stringify(state.analyticsId)}`,
    );
  }
}
