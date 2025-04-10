import type { StateMetadata } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import { encrypt, decrypt } from '@metamask/browser-passworder';

import { controllerName } from './constants';
import type {
  Encryptor,
  SeedlessOnboardingControllerMessenger,
  SeedlessOnboardingControllerOptions,
  SeedlessOnboardingControllerState,
} from './types';

/**
 * Seedless Onboarding Controller State Metadata.
 *
 * This allows us to choose if fields of the state should be persisted or not
 * using the `persist` flag; and if they can be sent to Sentry or not, using
 * the `anonymous` flag.
 */
const seedlessOnboardingMetadata: StateMetadata<SeedlessOnboardingControllerState> =
  {
    vault: {
      persist: true,
      anonymous: false,
    },
    isNewUser: {
      persist: true,
      anonymous: false,
    },
  };

export const defaultState: SeedlessOnboardingControllerState = {
  isNewUser: true,
  vault: undefined,
};

export class SeedlessOnboardingController extends BaseController<
  typeof controllerName,
  SeedlessOnboardingControllerState,
  SeedlessOnboardingControllerMessenger
> {
  readonly #vaultEncryptor: Encryptor = {
    encrypt,
    decrypt,
  };

  constructor({
    messenger,
    state,
    encryptor,
  }: SeedlessOnboardingControllerOptions) {
    super({
      name: controllerName,
      metadata: seedlessOnboardingMetadata,
      state: {
        ...defaultState,
        ...state,
      },
      messenger,
    });

    if (encryptor) {
      this.#vaultEncryptor = encryptor;
    }
  }
}
