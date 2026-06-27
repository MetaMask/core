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
    // Type cast required: RampsServiceMessenger's parent constraint includes
    // AuthenticationController:getBearerToken which is not in DefaultActions
    // (these are opt-in configs, not default wallet instances).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messenger: RampsServiceMessenger = new Messenger({
      namespace: 'RampsService',
      parent: parent as never,
    });

    parent.delegate({
      messenger,
      actions: ['AuthenticationController:getBearerToken'] as never[],
      events: [],
    });

    return messenger;
  },
};
