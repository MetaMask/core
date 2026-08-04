import { Messenger } from '@metamask/messenger';
import { SubscriptionService } from '@metamask/subscription-controller';
import type { SubscriptionServiceMessenger } from '@metamask/subscription-controller';

import type { InitializationConfiguration } from '../../types.js';

export type { SubscriptionServiceInstanceOptions } from './types.js';

export const subscriptionService: InitializationConfiguration<
  SubscriptionService,
  SubscriptionServiceMessenger
> = {
  name: 'SubscriptionService',
  init: ({ messenger, options }) =>
    new SubscriptionService({
      messenger,
      ...options,
    }),
  getMessenger: (parent) => {
    const messenger: SubscriptionServiceMessenger = new Messenger({
      namespace: 'SubscriptionService',
      parent,
    });

    parent.delegate({
      messenger,
      actions: [
        'AuthenticationController:getBearerToken',
        'AuthenticationController:getSessionProfile',
      ],
    });

    return messenger;
  },
};
