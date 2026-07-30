import { Messenger } from '@metamask/messenger';
import type { SubscriptionControllerMessenger } from '@metamask/subscription-controller';
import { SubscriptionController } from '@metamask/subscription-controller';

import type { InitializationConfiguration } from '../../types.js';

export type { SubscriptionControllerInstanceOptions } from './types.js';

export const subscriptionController: InitializationConfiguration<
  SubscriptionController,
  SubscriptionControllerMessenger
> = {
  name: 'SubscriptionController',
  init: ({ state, messenger, options }) =>
    new SubscriptionController({
      messenger,
      state,
      ...options,
    }),
  getMessenger: (parent) => {
    const messenger: SubscriptionControllerMessenger = new Messenger({
      namespace: 'SubscriptionController',
      parent,
    });

    parent.delegate({
      messenger,
      actions: [
        'AuthenticationController:getBearerToken',
        'AuthenticationController:performSignOut',
      ],
    });

    return messenger;
  },
};
