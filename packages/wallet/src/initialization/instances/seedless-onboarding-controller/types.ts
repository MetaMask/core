import type { SeedlessOnboardingControllerOptions } from '@metamask/seedless-onboarding-controller';

export type SeedlessOnboardingControllerInstanceOptions = Omit<
  SeedlessOnboardingControllerOptions,
  'messenger' | 'state'
>;
