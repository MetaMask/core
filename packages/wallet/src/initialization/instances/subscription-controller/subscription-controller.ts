import { Messenger } from '@metamask/messenger';
import type { SubscriptionControllerMessenger } from '@metamask/subscription-controller';
import { SubscriptionController } from '@metamask/subscription-controller';

import type { InitializationConfiguration } from '../../types.js';

export type { SubscriptionControllerInstanceOptions } from './types.js';

const SUBSCRIPTION_SERVICE_ACTIONS = [
  'SubscriptionService:getSubscriptions',
  'SubscriptionService:cancelSubscription',
  'SubscriptionService:unCancelSubscription',
  'SubscriptionService:startSubscriptionWithCard',
  'SubscriptionService:startSubscriptionWithCrypto',
  'SubscriptionService:updatePaymentMethodCard',
  'SubscriptionService:updatePaymentMethodCrypto',
  'SubscriptionService:getSubscriptionsEligibilities',
  'SubscriptionService:submitUserEvent',
  'SubscriptionService:assignUserToCohort',
  'SubscriptionService:submitSponsorshipIntents',
  'SubscriptionService:linkRewards',
  'SubscriptionService:getPricing',
  'SubscriptionService:getBillingPortalUrl',
] as const;

export const subscriptionController: InitializationConfiguration<
  SubscriptionController,
  SubscriptionControllerMessenger
> = {
  name: 'SubscriptionController',
  init: ({ state, messenger, options }) =>
    new SubscriptionController({
      ...options,
      messenger,
      state,
    }),
  getMessenger: (parent) => {
    const messenger: SubscriptionControllerMessenger = new Messenger({
      namespace: 'SubscriptionController',
      parent,
    });

    parent.delegate({
      messenger,
      actions: [
        ...SUBSCRIPTION_SERVICE_ACTIONS,
        'AuthenticationController:performSignOut',
      ],
    });

    return messenger;
  },
};
