import type { ConfigRegistryControllerMessenger } from '../ConfigRegistryController';

const FEATURE_FLAG_KEY = 'configRegistryApiEnabled';
const DEFAULT_FEATURE_FLAG_VALUE = false;

/**
 * Checks if the config registry API feature flag is enabled.
 *
 * @param messenger - The controller messenger.
 * @returns True if the feature flag is enabled, false otherwise.
 */
export function isConfigRegistryApiEnabled(
  messenger: ConfigRegistryControllerMessenger,
): boolean {
  try {
    const state = messenger.call('RemoteFeatureFlagController:getState');
    const featureFlags = state.remoteFeatureFlags;

    const flagValue = featureFlags[FEATURE_FLAG_KEY];

    if (typeof flagValue === 'boolean') {
      return flagValue;
    }

    return DEFAULT_FEATURE_FLAG_VALUE;
  } catch {
    return DEFAULT_FEATURE_FLAG_VALUE;
  }
}
