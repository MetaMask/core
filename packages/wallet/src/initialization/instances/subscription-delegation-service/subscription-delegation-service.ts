import { Messenger } from '@metamask/messenger';
import { SubscriptionDelegationService } from '@metamask/subscription-controller';
import type { SubscriptionDelegationServiceMessenger } from '@metamask/subscription-controller';

import type { InitializationConfiguration } from '../../types.js';

export const subscriptionDelegationService: InitializationConfiguration<
  SubscriptionDelegationService,
  SubscriptionDelegationServiceMessenger
> = {
  name: 'SubscriptionDelegationService',
  init: ({ messenger }) =>
    new SubscriptionDelegationService({
      messenger,
    }),
  getMessenger: (parent) => {
    const messenger: SubscriptionDelegationServiceMessenger = new Messenger({
      namespace: 'SubscriptionDelegationService',
      parent,
    });

    parent.delegate({
      messenger,
      actions: [
        'AuthenticatedUserStorageService:listDelegations',
        'AuthenticatedUserStorageService:createDelegation',
        'ChompApiService:verifyDelegation',
        'ChompApiService:createIntents',
        'ChompApiService:getIntentsByAddress',
        'ChompApiService:getServiceDetails',
        'DelegationController:signDelegation',
        'RemoteFeatureFlagController:getState',
      ],
    });

    return messenger;
  },
};
