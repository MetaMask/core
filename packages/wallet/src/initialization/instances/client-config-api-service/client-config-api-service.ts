import { Messenger } from '@metamask/messenger';
import { ClientConfigApiService } from '@metamask/remote-feature-flag-controller';
import type { ClientConfigApiServiceMessenger } from '@metamask/remote-feature-flag-controller';

import type { InitializationConfiguration } from '../../types.js';

export type { ClientConfigApiServiceInstanceOptions } from './types.js';

export const clientConfigApiService: InitializationConfiguration<
  ClientConfigApiService,
  ClientConfigApiServiceMessenger
> = {
  name: 'ClientConfigApiService',
  init: ({ messenger, options }) =>
    new ClientConfigApiService({
      messenger,
      fetch: options.fetch,
      config: options.config,
      policyOptions: options.policyOptions,
    }),
  getMessenger: (parent) =>
    new Messenger({
      namespace: 'ClientConfigApiService',
      parent,
    }),
};
