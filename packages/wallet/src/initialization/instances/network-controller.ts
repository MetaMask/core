import { CONNECTIVITY_STATUSES } from '@metamask/connectivity-controller';
import { DEFAULT_MAX_RETRIES } from '@metamask/controller-utils';
import {
  Messenger,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import type { NetworkControllerOptions } from '@metamask/network-controller';
import {
  NetworkController,
  NetworkControllerMessenger,
} from '@metamask/network-controller';
import { Duration, inMilliseconds } from '@metamask/utils';

import { InitializationConfiguration } from '../types';

type AllowedActions = MessengerActions<NetworkControllerMessenger>;

type AllowedEvents = MessengerEvents<NetworkControllerMessenger>;

export const networkController: InitializationConfiguration<
  NetworkController,
  NetworkControllerMessenger
> = {
  name: 'NetworkController',
  init: ({ state, messenger, options }) => {
    const fetchFn = globalThis.fetch.bind(globalThis);

    const getRpcServiceOptions: NetworkControllerOptions['getRpcServiceOptions'] =
      () => {
        const maxRetries = DEFAULT_MAX_RETRIES;

        const isOffline = (): boolean => {
          const connectivityState = messenger.call(
            'ConnectivityController:getState',
          );
          return (
            connectivityState.connectivityStatus ===
            CONNECTIVITY_STATUSES.Offline
          );
        };

        return {
          fetch: fetchFn,
          btoa: globalThis.btoa.bind(globalThis),
          isOffline,
          policyOptions: {
            // Ensure that the "cooldown" period after breaking the circuit is short.
            circuitBreakDuration: inMilliseconds(30, Duration.Second),
            maxRetries,
            // Ensure that if the endpoint continually responds with errors, we
            // break the circuit relatively fast (but not prematurely).
            //
            // Note that the circuit will break much faster if the errors are
            // retriable (e.g. 503) than if not (e.g. 500), so we attempt to strike
            // a balance here.
            maxConsecutiveFailures: (maxRetries + 1) * 3,
          },
        };
      };

    const instance = new NetworkController({
      state,
      messenger,
      getRpcServiceOptions,
      infuraProjectId: options.infuraProjectId,
    });

    return {
      instance,
    };
  },
  messenger: (parent) => {
    const networkControllerMessenger = new Messenger<
      'NetworkController',
      AllowedActions,
      AllowedEvents,
      typeof parent
    >({
      namespace: 'NetworkController',
      parent,
    });

    parent.delegate({
      messenger: networkControllerMessenger,
      actions: ['ConnectivityController:getState'],
      events: [],
    });

    return networkControllerMessenger;
  },
};
