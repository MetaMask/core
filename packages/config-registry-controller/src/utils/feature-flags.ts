import { Json } from '@metamask/utils';

export const FEATURE_FLAG_KEY = 'configRegistryApiEnabled';
const DEFAULT_FEATURE_FLAG_VALUE = false;

/**
 * Selector: returns whether the config registry API feature flag is enabled
 * from the given flag value.
 *
 * @param featureFlagValue - The feature flag value
 * @returns True if the feature flag is enabled, false otherwise.
 */
export function isConfigRegistryApiEnabled(featureFlagValue: Json): boolean {
  if (typeof featureFlagValue === 'boolean' && featureFlagValue) {
    return true;
  }

  return DEFAULT_FEATURE_FLAG_VALUE;
}
