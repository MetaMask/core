import type { Json } from '@metamask/utils';

import type { MultiVersionFeatureFlagValue } from '../remote-feature-flag-controller-types';

/**
 * Constants for MultiVersionFeatureFlagValue property names
 * to ensure consistency across validation, type checking, and other usage.
 */
export const MULTI_VERSION_FLAG_KEYS = {
  VERSIONS: 'versions',
} as const;

/**
 * Checks if a feature flag value is a multi-version gated flag (contains versions array).
 *
 * @param value - The feature flag value to check
 * @returns true if the value is a multi-version feature flag, false otherwise
 */
export function isVersionFeatureFlag(
  value: Json,
): value is MultiVersionFeatureFlagValue {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    !(MULTI_VERSION_FLAG_KEYS.VERSIONS in value)
  ) {
    return false;
  }

  const versions = (value as Record<string, unknown>)[
    MULTI_VERSION_FLAG_KEYS.VERSIONS
  ];

  return (
    typeof versions === 'object' &&
    versions !== null &&
    !Array.isArray(versions)
  );
}

/**
 * Selects the appropriate version value from a multi-version feature flag based on current app version.
 * Returns the value from the highest version that the app version meets or exceeds.
 *
 * @param multiVersionFlag - The multi-version feature flag
 * @param currentAppVersion - The current application version
 * @returns The selected version value, or null if no version requirements are met
 */
export function getVersionData(
  multiVersionFlag: MultiVersionFeatureFlagValue,
  currentAppVersion: string,
): Json | null {
  const sortedVersions = Object.entries(multiVersionFlag.versions).sort(
    ([versionA], [versionB]) => {
      return isVersionAtLeast(versionA, versionB) ? -1 : 1;
    },
  );

  for (const [version, data] of sortedVersions) {
    if (isVersionAtLeast(currentAppVersion, version)) {
      return data;
    }
  }

  return null;
}

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
 * Normalizes a version string to an array of numbers.
 *
 * @param version - The version string to normalize
 * @returns The normalized version as an array of numbers
 */
function normalizeVersion(version: string): number[] {
  return version.split('.').map(Number);
}
