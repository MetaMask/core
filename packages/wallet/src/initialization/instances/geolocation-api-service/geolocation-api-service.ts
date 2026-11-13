import { Env, GeolocationApiService } from '@metamask/geolocation-controller';
import type { GeolocationApiServiceMessenger } from '@metamask/geolocation-controller';
import { Messenger } from '@metamask/messenger';

import type { InitializationConfiguration } from '../../types.js';

export type { GeolocationApiServiceInstanceOptions } from './types.js';

export const geolocationApiService: InitializationConfiguration<
  GeolocationApiService,
  GeolocationApiServiceMessenger
> = {
  name: 'GeolocationApiService',
  init: ({ messenger, options }) =>
    new GeolocationApiService({
      messenger,
      env: options.env ?? Env.PRD,
      fetch: options.fetch,
      ttlMs: options.ttlMs,
      policyOptions: options.policyOptions,
    }),
  getMessenger: (parent) =>
    new Messenger({
      namespace: 'GeolocationApiService',
      parent,
    }),
};
