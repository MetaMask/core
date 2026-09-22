import { Messenger } from '@metamask/messenger';
import {
  PasskeyController,
  PasskeyControllerMessenger,
} from '@metamask/passkey-controller';

import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../../defaults.js';
import { InitializationConfiguration } from '../../types.js';

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
  getMessenger: (parent: RootMessenger<DefaultActions, DefaultEvents>) => {
    const passkeyControllerMessenger: PasskeyControllerMessenger =
      new Messenger({
        namespace: 'PasskeyController',
        parent,
      });

    parent.delegate({
      messenger: passkeyControllerMessenger,
      actions: [
        'KeyringController:verifyPassword',
        'KeyringController:exportEncryptionKey',
        'KeyringController:submitEncryptionKey',
        'KeyringController:changePassword',
        'KeyringController:exportSeedPhrase',
        'KeyringController:exportAccount',
      ],
      events: [],
    });

    return passkeyControllerMessenger;
  },
};
