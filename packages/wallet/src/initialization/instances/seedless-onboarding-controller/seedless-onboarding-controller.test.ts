import { Messenger } from '@metamask/messenger';
import {
  SecretType,
  SeedlessOnboardingController,
  getDefaultSeedlessOnboardingControllerState,
} from '@metamask/seedless-onboarding-controller';

import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../../defaults.js';
import { encryptorFactory } from '../keyring-controller/encryptor.js';
import { seedlessOnboardingController } from './seedless-onboarding-controller.js';
import type { SeedlessOnboardingControllerInstanceOptions } from './types.js';

/**
 * Creates a root messenger for use in tests.
 *
 * @returns A root messenger.
 */
function getRootMessenger(): RootMessenger<DefaultActions, DefaultEvents> {
  return new Messenger({ namespace: 'Root' });
}

/**
 * Creates the required seedless onboarding options for tests.
 *
 * @returns Seedless onboarding controller options.
 */
function getSeedlessOnboardingOptions(): SeedlessOnboardingControllerInstanceOptions {
  return {
    encryptor: encryptorFactory(
      600_000,
    ) as SeedlessOnboardingControllerInstanceOptions['encryptor'],
    refreshJWTToken: jest.fn(),
    revokeRefreshToken: jest.fn(),
    renewRefreshToken: jest.fn(),
  };
}

describe('seedlessOnboardingController', () => {
  it('initializes a SeedlessOnboardingController with default state', () => {
    const messenger =
      seedlessOnboardingController.getMessenger(getRootMessenger());

    const instance = seedlessOnboardingController.init({
      state: undefined,
      messenger,
      options: getSeedlessOnboardingOptions(),
    });

    expect(instance).toBeInstanceOf(SeedlessOnboardingController);
    expect(instance.state).toStrictEqual(
      getDefaultSeedlessOnboardingControllerState(),
    );
  });

  it('forwards the provided state to the controller', () => {
    const messenger =
      seedlessOnboardingController.getMessenger(getRootMessenger());

    const instance = seedlessOnboardingController.init({
      state: {
        migrationVersion: 1,
        isSeedlessOnboardingUserAuthenticated: false,
        socialBackupsMetadata: [{ hash: 'abc', type: SecretType.Mnemonic }],
      },
      messenger,
      options: getSeedlessOnboardingOptions(),
    });

    expect(instance.state.migrationVersion).toBe(1);
    expect(instance.state.socialBackupsMetadata).toStrictEqual([
      { hash: 'abc', type: SecretType.Mnemonic },
    ]);
  });

  it('reports unauthenticated when initialized with default state', async () => {
    const messenger =
      seedlessOnboardingController.getMessenger(getRootMessenger());

    const instance = seedlessOnboardingController.init({
      state: undefined,
      messenger,
      options: getSeedlessOnboardingOptions(),
    });

    expect(await instance.getIsUserAuthenticated()).toBe(false);
  });

  it('exposes its state through the root messenger', () => {
    const rootMessenger = getRootMessenger();
    const messenger = seedlessOnboardingController.getMessenger(rootMessenger);

    seedlessOnboardingController.init({
      state: undefined,
      messenger,
      options: getSeedlessOnboardingOptions(),
    });

    expect(
      rootMessenger.call('SeedlessOnboardingController:getState'),
    ).toStrictEqual(getDefaultSeedlessOnboardingControllerState());
  });
});
