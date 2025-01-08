import type { Json } from '@metamask/utils';
import { validate as uuidValidate, version as uuidVersion } from 'uuid';

import type { FeatureFlagScopeValue } from '../remote-feature-flag-controller-types';

/**
 * Generates a deterministic random number between 0 and 1 based on a metaMetricsId.
 * This is useful for A/B testing and feature flag rollouts where we want
 * consistent group assignment for the same user.
 *
 * Supports two metaMetricsId formats:
 * - UUIDv4 format (new mobile implementation)
 * - Hex format with 0x prefix (extension or old mobile implementation)
 *
 * For UUIDv4 format, the following normalizations are applied:
 * - Replaces version (4) bits with 'f' to normalize range
 * - Replaces variant bits (8-b) with 'f' to normalize range
 * - Removes all dashes from the UUID
 *
 * For hex format:
 * - Expects a hex string with '0x' prefix (e.g., '0x1234abcd')
 * - Removes the '0x' prefix before conversion
 * - Converts the remaining hex string to a BigInt for calculation
 *
 * @param metaMetricsId - The unique identifier used to generate the deterministic random number, can be a UUIDv4 or hex string
 * @returns A number between 0 and 1 that is deterministic for the given metaMetricsId
 */
export function generateDeterministicRandomNumber(
  metaMetricsId: string,
): number {
  let cleanId: string, value: bigint;
  // uuidv4 format
  if (uuidValidate(metaMetricsId) && uuidVersion(metaMetricsId) === 4) {
    cleanId = metaMetricsId.replace(/^(.{12})4/u, '$1f').replace(/-/gu, '');
    value = BigInt(`0x${cleanId}`);
  } else {
    // hex format with 0x prefix
    cleanId = metaMetricsId.slice(2);
    value = BigInt(`0x${cleanId}`);
  }
  const maxValue = BigInt(`0x${'f'.repeat(cleanId.length)}`);
  // Use BigInt division first, then convert to number to maintain precision
  return Number((value * BigInt(1000000)) / maxValue) / 1000000;
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
