import { Messenger } from '@metamask/messenger';
import {
  PasskeyController,
  PasskeyControllerMessenger,
} from '@metamask/passkey-controller';

import { InitializationConfiguration } from '../../types';

export const passkeyController: InitializationConfiguration<
  PasskeyController,
  PasskeyControllerMessenger
> = {
  name: 'PasskeyController',
  init: ({ state, messenger, options }) =>
    new PasskeyController({
      ...options,
      messenger,
      state,
    }),
  getMessenger: (parent) =>
    new Messenger({
      namespace: 'PasskeyController',
      parent,
    }),
};
