/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { RemoteFeatureFlagControllerGetStateAction } from '@metamask/remote-feature-flag-controller';

export const getFeatureFlags = <
  MessengerType extends {
    call(
      action: RemoteFeatureFlagControllerGetStateAction['type'],
    ): ReturnType<RemoteFeatureFlagControllerGetStateAction['handler']>;
  },
>(
  messenger: MessengerType,
) => {
  const remoteFeatureFlags = messenger.call(
    'RemoteFeatureFlagController:getState',
  )?.remoteFeatureFlags;
  return remoteFeatureFlags;
};
