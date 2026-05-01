import { gt, lt } from 'semver';

type IsVersionInBounds = {
  currentVersion?: string;
  minVersion?: string;
  maxVersion?: string;
};

/**
 * Checks if a given version is within bounds against a min and max bound
 * Uses semver strings
 *
 * @param params - Object param containing current/min/max versions
 * @param params.currentVersion - (optional) current version of application
 * @param params.minVersion - (optional) exclusive min bounds
 * @param params.maxVersion - (optional) exclusive max bounds
 * @returns boolean is version provided is within bounds
 */
export function isVersionInBounds({
  currentVersion,
  minVersion,
  maxVersion,
}: IsVersionInBounds): boolean {
  if (!currentVersion) {
    return true;
  }

  try {
    let showNotification = true;

    // Check minimum version: current version must be greater than minimum
    if (minVersion) {
      showNotification = showNotification && gt(currentVersion, minVersion);
    }

    // Check maximum version: current version must be less than maximum
    if (maxVersion) {
      showNotification = showNotification && lt(currentVersion, maxVersion);
    }

    return showNotification;
  } catch {
    // something went wrong checking bounds
    return false;
  }
}
