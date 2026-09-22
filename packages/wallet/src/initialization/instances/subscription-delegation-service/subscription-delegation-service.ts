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
        'ApprovalController:addRequest',
        'DelegationController:signDelegation',
        'MoneyAccountController:getDelegationsReadiness',
        'MoneyAccountController:ensureDelegationsReadiness',
        'MoneyAccountBalanceService:fetchBalanceWithFallback',
        'RemoteFeatureFlagController:getState',
        'SubscriptionController:getState',
        'SubscriptionController:getPricing',
        'SubscriptionController:getSubscriptions',
        'SubscriptionController:startSubscriptionWithCrypto',
      ],
    });

    return messenger;
  },
};
