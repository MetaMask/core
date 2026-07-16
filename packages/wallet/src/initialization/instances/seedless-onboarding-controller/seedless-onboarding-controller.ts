import { EncryptionKey } from '@metamask/browser-passworder';
import { Encryptor } from '@metamask/keyring-controller';
import { Messenger } from '@metamask/messenger';
import {
  SeedlessOnboardingController,
  SeedlessOnboardingControllerMessenger,
} from '@metamask/seedless-onboarding-controller';

import { InitializationConfiguration } from '../../types';
import { encryptorFactory } from '../keyring-controller/encryptor';

export const seedlessOnboardingController: InitializationConfiguration<
  SeedlessOnboardingController,
  SeedlessOnboardingControllerMessenger
> = {
  name: 'SeedlessOnboardingController',
  init: ({ state, messenger, options }) =>
    new SeedlessOnboardingController({
      ...options,
      state,
      messenger,
      encryptor: (options.encryptor ??
        encryptorFactory(600_000)) as Encryptor<EncryptionKey>,
    }),
  getMessenger: (parent) =>
    new Messenger({
      namespace: 'SeedlessOnboardingController',
      parent,
    }),
};
