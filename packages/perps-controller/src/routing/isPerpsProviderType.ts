import type { PerpsProviderType } from '../types/index.js';

/**
 * Validate a value against the closed set of direct perps venues.
 *
 * @param value - Runtime value, including values from persisted state or JS callers.
 * @returns Whether the value identifies a supported direct venue.
 * @internal
 */
export function isPerpsProviderType(
  value: unknown,
): value is PerpsProviderType {
  return value === 'hyperliquid' || value === 'lighter';
}
