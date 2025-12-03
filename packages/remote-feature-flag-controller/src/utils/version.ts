import { gtVersion, isValidSemVerVersion } from '@metamask/utils';
import type { Json, SemVerVersion } from '@metamask/utils';

import type { MultiVersionFeatureFlagValue } from '../remote-feature-flag-controller-types';

/**
 * Constants for MultiVersionFeatureFlagValue property names
 * to ensure consistency across validation, type checking, and other usage.
 */
export const MULTI_VERSION_FLAG_KEYS = {
  VERSIONS: 'versions',
} as const;

/**
 * Checks if a feature flag value is a multi-version gated flag (contains versions object with valid SemVer keys).
 *
 * @param value - The feature flag value to check
 * @returns true if the value is a multi-version feature flag with valid SemVer version keys, false otherwise
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

  const versions = value[MULTI_VERSION_FLAG_KEYS.VERSIONS];

  if (
    typeof versions !== 'object' ||
    versions === null ||
    Array.isArray(versions)
  ) {
    return false;
  }

  // Validate that all version keys are valid SemVer versions
  const versionKeys = Object.keys(versions);
  return versionKeys.every((versionKey) => isValidSemVerVersion(versionKey));
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
  currentAppVersion: SemVerVersion,
): Json | null {
  const sortedVersions = getObjectEntries(multiVersionFlag.versions).sort(
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
 * Both versions are expected to be valid SemVer format (e.g., "13.9.5").
 *
 * @param currentVersion - The current version (e.g., "13.9.5")
 * @param requiredVersion - The required minimum version (e.g., "13.10.0")
 * @returns true if currentVersion >= requiredVersion, false otherwise
 */
function isVersionAtLeast(
  currentVersion: SemVerVersion,
  requiredVersion: SemVerVersion,
): boolean {
  return (
    currentVersion === requiredVersion ||
    gtVersion(currentVersion, requiredVersion)
  );
}

/**
 * A utility function that calls `Object.entries` while preserving the index type.
 *
 * @param input - The object to get the entries of.
 * @returns - The object entries.
 */
function getObjectEntries<Input extends Record<string, unknown>>(
  input: Input,
): [keyof Input, Input[keyof Input]][] {
  // Use cast to preserve index type. Object.entries always widens to string.
  return Object.entries(input) as [keyof Input, Input[keyof Input]][];
}
