import { Messenger } from '@metamask/messenger';
import {
  SeedlessOnboardingController,
  SeedlessOnboardingControllerMessenger,
} from '@metamask/seedless-onboarding-controller';

import { InitializationConfiguration } from '../../types.js';
import { encryptorFactory } from '../keyring-controller/encryptor.js';

export const seedlessOnboardingController: InitializationConfiguration<
  SeedlessOnboardingController,
  SeedlessOnboardingControllerMessenger
> = {
  name: 'SeedlessOnboardingController',
  init: ({ state, messenger, options }) =>
    new SeedlessOnboardingController({
      ...options,
      encryptor: options?.encryptor ?? encryptorFactory(600_000),
      state,
      messenger,
    }),
  getMessenger: (parent) =>
    new Messenger({
      namespace: 'SeedlessOnboardingController',
      parent,
    }),
};
