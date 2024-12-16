import type { Json } from '@metamask/utils';
import { v4 as uuidV4 } from 'uuid';

import type { FeatureFlagScopeValue } from '../remote-feature-flag-controller-types';

/* eslint-disable no-bitwise */
/**
 * Generates a deterministic random number between 0 and 1 based on a metaMetricsId.
 * This is useful for A/B testing and feature flag rollouts where we want
 * consistent group assignment for the same user.
 *
 * @param metaMetricsId - The unique identifier used to generate the deterministic random number
 * @returns A number between 0 and 1 that is deterministic for the given metaMetricsId
 */
export function generateDeterministicRandomNumber(
  metaMetricsId: string,
): number {
  const hash = [...metaMetricsId].reduce((acc, char) => {
    const chr = char.charCodeAt(0);
    return ((acc << 5) - acc + chr) | 0;
  }, 0);

  return (hash >>> 0) / 0xffffffff;
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

/**
 * Generates UUIDv4 as a fallback metaMetricsId
 * @returns A UUIDv4 string
 */
export function generateFallbackMetaMetricsId(): string {
  return uuidV4();
}
