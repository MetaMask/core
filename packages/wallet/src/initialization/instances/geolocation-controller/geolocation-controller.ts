import { GeolocationController } from '@metamask/geolocation-controller';
import type { GeolocationControllerMessenger } from '@metamask/geolocation-controller';
import { Messenger } from '@metamask/messenger';

import type { InitializationConfiguration } from '../../types.js';

export const geolocationController: InitializationConfiguration<
  GeolocationController,
  GeolocationControllerMessenger
> = {
  name: 'GeolocationController',
  reference: GeolocationController,
  init: ({ state, messenger }) =>
    new GeolocationController({
      messenger,
      state,
    }),
  getMessenger: (parent) => {
    const messenger: GeolocationControllerMessenger = new Messenger({
      namespace: 'GeolocationController',
      parent,
    });

    parent.delegate({
      messenger,
      actions: ['GeolocationApiService:fetchGeolocationData'],
    });

    return messenger;
  },
};
