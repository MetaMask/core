import type { Json } from '@metamask/utils';

import type { FeatureFlagScopeValue } from '../remote-feature-flag-controller-types';
import { ClientType } from '../remote-feature-flag-controller-types';

const BITS_PER_CHAR = 5;
const MAX_SAFE_BITS = 30; // Use 30 bits to stay well within 32-bit integer limits

/* eslint-disable no-bitwise */
/**
 * Generates a deterministic random number between 0 and 1 based on a metaMetricsId.
 * Handles both mobile (uuidv4) and extension (hex) formats.
 *
 * @param client - The client type (Mobile or Extension)
 * @param id - The unique identifier (uuidv4 for mobile, hex for extension)
 * @returns A number between 0 and 1
 */
export function generateDeterministicRandomNumber(
  client: ClientType,
  id: string,
): number {
  if (client === ClientType.Mobile) {
    const maxValue = (1 << MAX_SAFE_BITS) - 1;
    const hash = [...id].reduce((acc, char) => {
      const chr = char.charCodeAt(0);
      return ((acc << BITS_PER_CHAR) - acc + chr) & maxValue;
    }, 0);
    return hash / maxValue;
  }

  // Default to Extension handling for all other cases
  const cleanHex = id.slice(2);
  const value = BigInt(`0x${cleanHex}`);
  const maxValue = BigInt(`0x${'f'.repeat(cleanHex.length)}`);
  return Number(value) / Number(maxValue);
}

/**
 * Type guard to check if a value is a feature flag with scope.
 * Used to validate feature flag objects that contain scope-based configurations.
 *
 * @param featureFlag - The value to check if it's a feature flag with scope
 * @returns True if the value is a feature flag with scope, false otherwise
 */
export const isFeatureFlagWithScopeValue = (
  featureFlag: Json,
): featureFlag is FeatureFlagScopeValue => {
  return (
    typeof featureFlag === 'object' &&
    featureFlag !== null &&
    'scope' in featureFlag
  );
};
