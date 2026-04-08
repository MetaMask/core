import { Messenger } from '@metamask/messenger';
import {
  RemoteFeatureFlagController,
  RemoteFeatureFlagControllerMessenger,
} from '@metamask/remote-feature-flag-controller';

import { InitializationConfiguration } from '../types';

export const remoteFeatureFlagController: InitializationConfiguration<
  RemoteFeatureFlagController,
  RemoteFeatureFlagControllerMessenger
> = {
  name: 'RemoteFeatureFlagController',
  init: ({ state, messenger, options }) => {
    // TODO: Add the rest of the arguments.
    const instance = new RemoteFeatureFlagController({
      state,
      messenger,
      clientVersion: options.clientVersion,
    });

    return {
      instance,
    };
  },
  messenger: (parent) =>
    new Messenger<'RemoteFeatureFlagController', never, never, typeof parent>({
      namespace: 'RemoteFeatureFlagController',
      parent,
    }),
};
