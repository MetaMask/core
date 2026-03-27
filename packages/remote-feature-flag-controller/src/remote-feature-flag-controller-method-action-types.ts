/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { RemoteFeatureFlagController } from './remote-feature-flag-controller';

/**
 * Retrieves the remote feature flags, fetching from the API if necessary.
 * Uses caching to prevent redundant API calls and handles concurrent fetches.
 *
 * @returns A promise that resolves to the current set of feature flags.
 */
export type RemoteFeatureFlagControllerUpdateRemoteFeatureFlagsAction = {
  type: `RemoteFeatureFlagController:updateRemoteFeatureFlags`;
  handler: RemoteFeatureFlagController['updateRemoteFeatureFlags'];
};

/**
 * Enables the controller, allowing it to make network requests.
 */
export type RemoteFeatureFlagControllerEnableAction = {
  type: `RemoteFeatureFlagController:enable`;
  handler: RemoteFeatureFlagController['enable'];
};

/**
 * Disables the controller, preventing it from making network requests.
 */
export type RemoteFeatureFlagControllerDisableAction = {
  type: `RemoteFeatureFlagController:disable`;
  handler: RemoteFeatureFlagController['disable'];
};

/**
 * Sets a local override for a specific feature flag.
 *
 * @param flagName - The name of the feature flag to override.
 * @param value - The override value for the feature flag.
 */
export type RemoteFeatureFlagControllerSetFlagOverrideAction = {
  type: `RemoteFeatureFlagController:setFlagOverride`;
  handler: RemoteFeatureFlagController['setFlagOverride'];
};

/**
 * Clears the local override for a specific feature flag.
 *
 * @param flagName - The name of the feature flag to clear.
 */
export type RemoteFeatureFlagControllerRemoveFlagOverrideAction = {
  type: `RemoteFeatureFlagController:removeFlagOverride`;
  handler: RemoteFeatureFlagController['removeFlagOverride'];
};

/**
 * Clears all local feature flag overrides.
 */
export type RemoteFeatureFlagControllerClearAllFlagOverridesAction = {
  type: `RemoteFeatureFlagController:clearAllFlagOverrides`;
  handler: RemoteFeatureFlagController['clearAllFlagOverrides'];
};

/**
 * Union of all RemoteFeatureFlagController action types.
 */
export type RemoteFeatureFlagControllerMethodActions =
  | RemoteFeatureFlagControllerUpdateRemoteFeatureFlagsAction
  | RemoteFeatureFlagControllerEnableAction
  | RemoteFeatureFlagControllerDisableAction
  | RemoteFeatureFlagControllerSetFlagOverrideAction
  | RemoteFeatureFlagControllerRemoveFlagOverrideAction
  | RemoteFeatureFlagControllerClearAllFlagOverridesAction;
