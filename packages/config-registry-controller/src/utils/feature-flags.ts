import type { RemoteFeatureFlagControllerState } from '@metamask/remote-feature-flag-controller';

const FEATURE_FLAG_KEY = 'configRegistryApiEnabled';
const DEFAULT_FEATURE_FLAG_VALUE = false;

/**
 * Selector: returns whether the config registry API feature flag is enabled
 * from the given RemoteFeatureFlagController state.
 *
 * @param state - The RemoteFeatureFlagController state.
 * @returns True if the feature flag is enabled, false otherwise.
 */
export function isConfigRegistryApiEnabled(
  state: RemoteFeatureFlagControllerState,
): boolean {
  const { remoteFeatureFlags } = state;
  const flagValue = remoteFeatureFlags?.[FEATURE_FLAG_KEY];

  if (typeof flagValue === 'boolean') {
    return flagValue;
  }

  return DEFAULT_FEATURE_FLAG_VALUE;
}
