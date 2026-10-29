import type { RemoteFeatureFlagControllerGetStateAction } from '@metamask/remote-feature-flag-controller';

export const getFeatureFlags = <
  T extends {
    call(
      action: RemoteFeatureFlagControllerGetStateAction['type'],
    ): ReturnType<RemoteFeatureFlagControllerGetStateAction['handler']>;
  },
>(
  messenger: T,
) => {
  const remoteFeatureFlags = messenger.call(
    'RemoteFeatureFlagController:getState',
  )?.remoteFeatureFlags;
  return remoteFeatureFlags;
};
