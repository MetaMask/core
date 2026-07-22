import { Messenger } from '@metamask/messenger';
import type {
  ISubscriptionService,
  SubscriptionControllerMessenger,
  SubscriptionControllerState,
} from '@metamask/subscription-controller';
import {
  SubscriptionController,
  SubscriptionService,
} from '@metamask/subscription-controller';

import type { InitializationConfiguration } from '../../types.js';
import type { SubscriptionControllerInstanceOptions } from './types.js';

export type { SubscriptionControllerInstanceOptions } from './types.js';

function resolveSubscriptionService(
  messenger: SubscriptionControllerMessenger,
  options: SubscriptionControllerInstanceOptions,
): ISubscriptionService {
  if (options.subscriptionService) {
    return options.subscriptionService;
  }

  const getAccessToken =
    options.getAccessToken ??
    ((): Promise<string> =>
      messenger.call('AuthenticationController:getBearerToken'));

  return new SubscriptionService({
    env: options.env,
    auth: { getAccessToken },
    fetchFunction: options.fetchFunction,
    captureException: options.captureException,
  });
}

export const subscriptionController: InitializationConfiguration<
  SubscriptionController,
  SubscriptionControllerMessenger
> = {
  name: 'SubscriptionController',
  init: ({
    state,
    messenger,
    options,
  }: {
    state: Partial<SubscriptionControllerState> | undefined;
    messenger: SubscriptionControllerMessenger;
    options: SubscriptionControllerInstanceOptions;
  }) => {
    const { pollingInterval, ...serviceOptions } = options;

    return new SubscriptionController({
      messenger,
      state,
      subscriptionService: resolveSubscriptionService(
        messenger,
        serviceOptions,
      ),
      pollingInterval,
    });
  },
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
      events: [
        // SubscriptionController subscribes to :stateChange internally; the
        // delegation must match until that package migrates to :stateChanged.
        // eslint-disable-next-line no-restricted-syntax
        'AuthenticationController:stateChange',
      ],
    });

    return messenger;
  },
};
