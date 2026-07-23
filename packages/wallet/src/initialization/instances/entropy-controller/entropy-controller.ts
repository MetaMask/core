import {
  EntropyController,
  EntropyControllerMessenger,
} from '@metamask/entropy-controller';
import { Messenger } from '@metamask/messenger';

import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../../defaults';
import type { InitializationConfiguration } from '../../types';

export const entropyController: InitializationConfiguration<
  EntropyController,
  EntropyControllerMessenger
> = {
  name: 'EntropyController',
  init: ({ state, messenger }) =>
    new EntropyController({
      state,
      messenger,
    }),
  getMessenger: (parent: RootMessenger<DefaultActions, DefaultEvents>) =>
    new Messenger({
      namespace: 'EntropyController',
      parent,
    }) as EntropyControllerMessenger,
};
