import type { SeedlessOnboardingControllerOptions } from '@metamask/seedless-onboarding-controller';

import { GenericEncryptor } from '../keyring-controller/encryptor';

export type SeedlessOnboardingControllerInstanceOptions = Omit<
  SeedlessOnboardingControllerOptions,
  'messenger' | 'state' | 'encryptor'
> & {
  /**
   * Encryptor used to protect the seedless onboarding vault. Defaults to a PBKDF2 encryptor
   * configured with 600,000 iterations.
   */
  encryptor?: GenericEncryptor;
};
