import type { Json } from '@metamask/utils';

import type { VersionedFeatureFlagValue } from '../remote-feature-flag-controller-types';

/**
 * Compares two semantic version strings.
 *
 * @param currentVersion - The current version (e.g., "13.9.5")
 * @param requiredVersion - The required minimum version (e.g., "13.10.0")
 * @returns true if currentVersion >= requiredVersion, false otherwise
 */
export function isVersionAtLeast(
  currentVersion: string,
  requiredVersion: string,
): boolean {
  const normalizeVersion = (version: string): number[] => {
    return version.split('.').map(Number);
  };

  const current = normalizeVersion(currentVersion);
  const required = normalizeVersion(requiredVersion);

  const maxLength = Math.max(current.length, required.length);
  while (current.length < maxLength) {
    current.push(0);
  }
  while (required.length < maxLength) {
    required.push(0);
  }

  for (let i = 0; i < maxLength; i++) {
    if (current[i] > required[i]) {
      return true;
    }
    if (current[i] < required[i]) {
      return false;
    }
  }

  return true;
}

/**
 * Checks if a feature flag value is a version gated (contains fromVersion and value properties).
 *
 * @param value - The feature flag value to check
 * @returns true if the value is a versioned feature flag, false otherwise
 */
export function isVersionGatedFeatureFlagValue(
  value: Json,
): value is VersionedFeatureFlagValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'fromVersion' in value &&
    'value' in value
  );
}
