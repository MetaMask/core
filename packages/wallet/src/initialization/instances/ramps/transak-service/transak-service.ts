import { Messenger } from '@metamask/messenger';
import {
  TransakService,
  TransakServiceMessenger,
} from '@metamask/ramps-controller';

import { InitializationConfiguration } from '../../../types';

export const transakService: InitializationConfiguration<
  TransakService,
  TransakServiceMessenger
> = {
  name: 'TransakService',
  init: ({ messenger, options }) =>
    new TransakService({
      messenger,
      environment: options.environment,
      context: options.context,
      fetch: options.fetch,
      apiKey: options.apiKey,
      policyOptions: options.policyOptions,
      orderRetryDelayMs: options.orderRetryDelayMs,
    }),
  getMessenger: (parent) =>
    new Messenger({
      namespace: 'TransakService',
      parent,
    }),
};
