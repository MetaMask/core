import { Messenger } from '@metamask/messenger';
import {
  PreferencesController,
  PreferencesControllerMessenger,
} from '@metamask/preferences-controller';

import type { InitializationConfiguration } from '../../types';

export const preferencesController: InitializationConfiguration<
  PreferencesController,
  PreferencesControllerMessenger
> = {
  name: 'PreferencesController',
  init: ({ state, messenger }) =>
    new PreferencesController({
      state,
      messenger,
    }),
  getMessenger: (parent) =>
    new Messenger({
      namespace: 'PreferencesController',
      parent,
    }),
};
