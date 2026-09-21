import { ConfigRegistryController } from '@metamask/config-registry-controller';
import type { ConfigRegistryControllerMessenger } from '@metamask/config-registry-controller';
import { Messenger } from '@metamask/messenger';

import type { InitializationConfiguration } from '../../types.js';

export type { ConfigRegistryControllerInstanceOptions } from './types.js';

export const configRegistryController: InitializationConfiguration<
  ConfigRegistryController,
  ConfigRegistryControllerMessenger
> = {
  name: 'ConfigRegistryController',
  init: ({ state, messenger, options }) =>
    new ConfigRegistryController({
      messenger,
      state,
      pollingInterval: options.pollingInterval,
      fallbackConfig: options.fallbackConfig,
    }),
  getMessenger: (parent) => {
    const messenger: ConfigRegistryControllerMessenger = new Messenger({
      namespace: 'ConfigRegistryController',
      parent,
    });

    parent.delegate({
      messenger,
      actions: [
        'KeyringController:getState',
        'RemoteFeatureFlagController:getState',
        'ConfigRegistryApiService:fetchConfig',
      ],
      events: [
        'KeyringController:unlock',
        'KeyringController:lock',

        'RemoteFeatureFlagController:stateChange',
      ],
    });

    return messenger;
  },
};
