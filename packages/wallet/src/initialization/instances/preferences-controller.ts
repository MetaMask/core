import { Messenger } from '@metamask/messenger';
import {
  PreferencesController,
  PreferencesControllerMessenger,
} from '@metamask/preferences-controller';

import { InitializationConfiguration } from '../types';

export const referencesController: InitializationConfiguration<
  PreferencesController,
  PreferencesControllerMessenger
> = {
  name: 'PreferencesController',
  init: ({ messenger, state }) => {
    const instance = new PreferencesController({
      messenger,
      state,
    });

    return {
      instance,
    };
  },
  messenger: (parent) =>
    new Messenger<'PreferencesController', never, never, typeof parent>({
      namespace: 'PreferencesController',
      parent,
    }),
};
