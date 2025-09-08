import type { RemoteFeatureFlagControllerState } from '@metamask/remote-feature-flag-controller';

/**
 * Gets the rewards feature flags from the remote feature flag controller
 *
 * @param messenger - Any messenger with access to RemoteFeatureFlagController:getState
 * @returns The rewards feature flag
 */
export function getRewardsFeatureFlag<
  T extends {
    call(
      action: 'RemoteFeatureFlagController:getState',
    ): RemoteFeatureFlagControllerState;
  },
>(messenger: T): boolean {
  const remoteFeatureFlagControllerState = messenger.call(
    'RemoteFeatureFlagController:getState',
  );

  const rewardsFlag = remoteFeatureFlagControllerState?.remoteFeatureFlags
    ?.rewards as boolean;

  return rewardsFlag;
}
