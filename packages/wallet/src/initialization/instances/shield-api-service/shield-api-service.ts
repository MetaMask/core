import { Messenger } from '@metamask/messenger';
import type { ShieldApiServiceMessenger } from '@metamask/shield-controller';
import { Env, ShieldApiService } from '@metamask/shield-controller';

import type { InitializationConfiguration } from '../../types.js';

export type { ShieldApiServiceInstanceOptions } from './types.js';

export const shieldApiService: InitializationConfiguration<
  ShieldApiService,
  ShieldApiServiceMessenger
> = {
  name: 'ShieldApiService',
  init: ({ messenger, options }) =>
    new ShieldApiService({
      messenger,
      env: options.env ?? Env.PRD,
      fetch: options.fetchFunction,
      captureException: options.captureException,
      getCoverageResultTimeout: options.getCoverageResultTimeout,
      getCoverageResultPollInterval: options.getCoverageResultPollInterval,
      queryClientConfig: options.queryClientConfig,
      policyOptions: options.policyOptions,
    }),
  getMessenger: (parent) => {
    const messenger: ShieldApiServiceMessenger = new Messenger({
      namespace: 'ShieldApiService',
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
