import { Messenger } from '@metamask/messenger';
import {
  SeedlessOnboardingController,
  SeedlessOnboardingControllerMessenger,
} from '@metamask/seedless-onboarding-controller';

import { InitializationConfiguration } from '../../types.js';

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
    }),
  getMessenger: (parent) =>
    new Messenger({
      namespace: 'SeedlessOnboardingController',
      parent,
    }),
};
