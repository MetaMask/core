import { Messenger } from '@metamask/messenger';
import { SubscriptionDelegationService } from '@metamask/subscription-controller';

import { defaultConfigurations } from '../../defaults.js';
import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../../defaults.js';
import { subscriptionDelegationService } from './subscription-delegation-service.js';

/**
 * Creates a root messenger for use in tests.
 *
 * @returns A root messenger.
 */
function getRootMessenger(): RootMessenger<DefaultActions, DefaultEvents> {
  return new Messenger({ namespace: 'Root' });
}

describe('subscriptionDelegationService', () => {
  it('is registered as a default initialization configuration', () => {
    expect(Object.values(defaultConfigurations)).toContain(
      subscriptionDelegationService,
    );
  });

  it('initializes a SubscriptionDelegationService', () => {
    const messenger =
      subscriptionDelegationService.getMessenger(getRootMessenger());

    const instance = subscriptionDelegationService.init({
      state: undefined,
      messenger,
      options: {},
    });

    expect(instance).toBeInstanceOf(SubscriptionDelegationService);
  });

  it('delegates the actions the service calls on other messengers', () => {
    const parent = getRootMessenger();
    const delegateSpy = jest.spyOn(parent, 'delegate');

    const messenger = subscriptionDelegationService.getMessenger(parent);

    expect(delegateSpy).toHaveBeenCalledWith({
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
  });
});
