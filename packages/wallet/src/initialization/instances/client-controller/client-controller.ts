import {
  ClientController,
  ClientControllerMessenger,
} from '@metamask/client-controller';
import { Messenger } from '@metamask/messenger';

import type { InitializationConfiguration } from '../../types.js';

export const clientController: InitializationConfiguration<
  ClientController,
  ClientControllerMessenger
> = {
  name: 'ClientController',
  reference: ClientController,
  init: ({ state, messenger }) =>
    new ClientController({
      state,
      messenger,
    }),
  getMessenger: (parent) =>
    new Messenger({
      namespace: 'ClientController',
      parent,
    }),
};
