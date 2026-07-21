import type { EncryptionKey } from '@metamask/browser-passworder';
import type { Encryptor } from '@metamask/keyring-controller';
import {
  KeyringController,
  KeyringControllerMessenger,
} from '@metamask/keyring-controller';
import { Messenger } from '@metamask/messenger';

import { InitializationConfiguration } from '../../types';
import { encryptorFactory } from './encryptor';

export const keyringController: InitializationConfiguration<
  KeyringController,
  KeyringControllerMessenger
> = {
  name: 'KeyringController',
  init: ({ state, messenger, options }) =>
    new KeyringController({
      state,
      messenger,
      keyringBuilders: options.keyringBuilders,
      keyringV2Builders: options.keyringV2Builders,
      encryptor: (options.encryptor ?? encryptorFactory(600_000)) as Encryptor<
        EncryptionKey | CryptoKey
      >,
    }),
  getMessenger: (parent) =>
    new Messenger({
      namespace: 'KeyringController',
      parent,
    }),
};
