import type { Json } from '@metamask/utils';

import type {
  MultiVersionFeatureFlagValue,
  VersionEntry,
} from '../remote-feature-flag-controller-types';

/**
 * Checks if a feature flag value is a multi-version gated flag (contains versions array).
 *
 * @param value - The feature flag value to check
 * @returns true if the value is a multi-version feature flag, false otherwise
 */
export function isMultiVersionFeatureFlagValue(
  value: Json,
): value is MultiVersionFeatureFlagValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'versions' in value &&
    Array.isArray(value.versions)
  );
}

/**
 * Selects the appropriate version value from a multi-version feature flag based on current app version.
 * Returns the value from the highest version that the app version meets or exceeds.
 *
 * @param multiVersionFlag - The multi-version feature flag
 * @param currentAppVersion - The current application version
 * @returns The selected version entry, or null if no version requirements are met
 */
export function selectVersionFromMultiVersionFlag(
  multiVersionFlag: MultiVersionFeatureFlagValue,
  currentAppVersion: string,
): VersionEntry | null {
  const eligibleVersions = multiVersionFlag.versions.filter((versionEntry) =>
    isVersionAtLeast(currentAppVersion, versionEntry.fromVersion),
  );

  if (eligibleVersions.length === 0) {
    return null;
  }

  // Compare versions - we want the highest version that still qualifies hence the first sort is descending
  return eligibleVersions.sort((a, b) => {
    return isVersionAtLeast(a.fromVersion, b.fromVersion) ? -1 : 1;
  })[0];
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
