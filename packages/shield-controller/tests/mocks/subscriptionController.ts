import type { RestrictedMessenger } from '@metamask/base-controller';

import type { SubscriptionControllerCheckSubscriptionStatusAction } from '../../src/mock';

/**
 *
 * @param messenger - The restricted messenger to use for communication.
 * @returns The mock subscription controller.
 */
export function createSubscriptionControllerMock(
  messenger: RestrictedMessenger<
    'SubscriptionController',
    SubscriptionControllerCheckSubscriptionStatusAction,
    never,
    never,
    never
  >,
) {
  const controller = {
    checkSubscriptionStatus: jest.fn(
      (_product: string): Promise<'subscribed' | 'not-subscribed'> => {
        return Promise.resolve('subscribed');
      },
    ),
  };
  messenger.registerActionHandler(
    'SubscriptionController:checkSubscriptionStatus',
    (product: string): Promise<'subscribed' | 'not-subscribed'> => {
      return controller.checkSubscriptionStatus(product);
    },
  );
  return controller;
}
