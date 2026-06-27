import { Messenger } from '@metamask/messenger';
import {
  RampsService,
  RampsServiceMessenger,
} from '@metamask/ramps-controller';

import { InitializationConfiguration } from '../../../types';

/**
 * Opt-in initialization config for `RampsService`.
 *
 * **Prerequisite:** `AuthenticationController` must be registered on the root
 * messenger before this config is used — `RampsService` delegates
 * `AuthenticationController:getBearerToken` and will throw at runtime if that
 * action is not available.
 */
export const rampsService: InitializationConfiguration<
  RampsService,
  RampsServiceMessenger
> = {
  name: 'RampsService',
  init: ({ messenger, options }) =>
    new RampsService({
      messenger,
      environment: options.environment,
      context: options.context,
      fetch: options.fetch,
      policyOptions: options.policyOptions,
      baseUrlOverride: options.baseUrlOverride,
    }),
  getMessenger: (parent) => {
    const messenger: RampsServiceMessenger = new Messenger({
      namespace: 'RampsService',
      parent,
    });

    parent.delegate({
      messenger,
      actions: ['AuthenticationController:getBearerToken'],
      events: [],
    });

    return messenger;
  },
};
