import { ConfigRegistryApiService } from '@metamask/config-registry-controller';
import type { ConfigRegistryApiServiceMessenger } from '@metamask/config-registry-controller';
import { Messenger } from '@metamask/messenger';

import type { InitializationConfiguration } from '../../types.js';

export type { ConfigRegistryApiServiceInstanceOptions } from './types.js';

export const configRegistryApiService: InitializationConfiguration<
  ConfigRegistryApiService,
  ConfigRegistryApiServiceMessenger
> = {
  name: 'ConfigRegistryApiService',
  init: ({ messenger, options }) =>
    new ConfigRegistryApiService({
      messenger,
      env: options.env,
      fetch: options.fetch,
      policyOptions: options.policyOptions,
    }),
  getMessenger: (parent) =>
    new Messenger({
      namespace: 'ConfigRegistryApiService',
      parent,
    }),
};
