import { ClaimsService } from '@metamask/claims-controller';
import type { ClaimsServiceMessenger } from '@metamask/claims-controller';
import { Messenger } from '@metamask/messenger';

import type { InitializationConfiguration } from '../../types.js';

export type { ClaimsServiceInstanceOptions } from './types.js';

export const claimsService: InitializationConfiguration<
  ClaimsService,
  ClaimsServiceMessenger
> = {
  name: 'ClaimsService',
  init: ({ messenger, options }) =>
    new ClaimsService({
      messenger,
      env: options.env,
      fetchFunction: options.fetchFunction,
    }),
  getMessenger: (parent) => {
    const messenger: ClaimsServiceMessenger = new Messenger({
      namespace: 'ClaimsService',
      parent,
    });

    parent.delegate({
      messenger,
      actions: ['AuthenticationController:getBearerToken'],
    });

    return messenger;
  },
};
