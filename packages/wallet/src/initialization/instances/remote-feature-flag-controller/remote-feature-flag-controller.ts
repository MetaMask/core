import { Messenger } from '@metamask/messenger';
import {
  RemoteFeatureFlagController,
  RemoteFeatureFlagControllerMessenger,
} from '@metamask/remote-feature-flag-controller';

import { InitializationConfiguration } from '../../types';

export const remoteFeatureFlagController: InitializationConfiguration<
  RemoteFeatureFlagController,
  RemoteFeatureFlagControllerMessenger
> = {
  name: 'RemoteFeatureFlagController',
  init: ({ state, messenger, options }) =>
    new RemoteFeatureFlagController({
      state,
      messenger,
      clientConfigApiService: options.clientConfigApiService,
      getMetaMetricsId: options.getMetaMetricsId ?? ((): string => ''),
      clientVersion: options.clientVersion ?? '0.0.0',
      prevClientVersion: options.prevClientVersion,
      fetchInterval: options.fetchInterval,
      disabled: options.disabled,
    }),
  getMessenger: (parent) =>
    new Messenger({
      namespace: 'RemoteFeatureFlagController',
      parent,
    }),
};
