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

  const versions = (value as Record<string, unknown>)[
    MULTI_VERSION_FLAG_KEYS.VERSIONS
  ];

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
 * Both versions are expected to be valid SemVer format (e.g., "13.9.5").
 *
 * @param currentVersion - The current version (e.g., "13.9.5")
 * @param requiredVersion - The required minimum version (e.g., "13.10.0")
 * @returns true if currentVersion >= requiredVersion, false otherwise
 */
function isVersionAtLeast(
  currentVersion: string,
  requiredVersion: string,
): boolean {
  // Both versions are guaranteed to be valid SemVer strings - validated by isVersionFeatureFlag()
  const current = currentVersion as SemVerVersion;
  const required = requiredVersion as SemVerVersion;

  return current === required || gtVersion(current, required);
}
