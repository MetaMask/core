import { Messenger } from '@metamask/messenger';
import {
  SecretType,
  SeedlessOnboardingController,
  getDefaultSeedlessOnboardingControllerState,
} from '@metamask/seedless-onboarding-controller';

import { defaultConfigurations } from '../../defaults';
import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../../defaults';
import { encryptorFactory } from '../keyring-controller/encryptor';
import * as encryptorModule from '../keyring-controller/encryptor';
import { seedlessOnboardingController } from './seedless-onboarding-controller';
import type { SeedlessOnboardingControllerInstanceOptions } from './types';

const { SeedlessOnboardingController: ActualSeedlessOnboardingController } =
  jest.requireActual('@metamask/seedless-onboarding-controller');

jest.mock('@metamask/seedless-onboarding-controller', () => ({
  ...jest.requireActual('@metamask/seedless-onboarding-controller'),
  SeedlessOnboardingController: jest.fn(),
}));

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
function getSeedlessOnboardingOptions(): Pick<
  SeedlessOnboardingControllerInstanceOptions,
  'refreshJWTToken' | 'revokeRefreshToken' | 'renewRefreshToken'
> {
  return {
    refreshJWTToken: jest.fn(),
    revokeRefreshToken: jest.fn(),
    renewRefreshToken: jest.fn(),
  };
}

describe('seedlessOnboardingController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (SeedlessOnboardingController as jest.Mock).mockImplementation(
      (...args: unknown[]) => new ActualSeedlessOnboardingController(...args),
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('is registered as a default initialization configuration', () => {
    expect(Object.values(defaultConfigurations)).toContain(
      seedlessOnboardingController,
    );
  });

  it('initializes a SeedlessOnboardingController with default state', () => {
    const messenger =
      seedlessOnboardingController.getMessenger(getRootMessenger());

    const instance = seedlessOnboardingController.init({
      state: undefined,
      messenger,
      options: getSeedlessOnboardingOptions(),
    });

    expect(instance).toBeInstanceOf(ActualSeedlessOnboardingController);
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

  it('forwards seedless onboarding options to the controller', () => {
    const messenger =
      seedlessOnboardingController.getMessenger(getRootMessenger());
    const options = getSeedlessOnboardingOptions();

    seedlessOnboardingController.init({
      state: undefined,
      messenger,
      options,
    });

    expect(SeedlessOnboardingController).toHaveBeenCalledWith(
      expect.objectContaining({
        refreshJWTToken: options.refreshJWTToken,
        revokeRefreshToken: options.revokeRefreshToken,
        renewRefreshToken: options.renewRefreshToken,
      }),
    );
  });

  it('applies the default encryptor when omitted', () => {
    const defaultEncryptor = encryptorFactory(600_000);
    const encryptorFactorySpy = jest
      .spyOn(encryptorModule, 'encryptorFactory')
      .mockReturnValue(defaultEncryptor);
    const messenger =
      seedlessOnboardingController.getMessenger(getRootMessenger());

    seedlessOnboardingController.init({
      state: undefined,
      messenger,
      options: getSeedlessOnboardingOptions(),
    });

    const { encryptor } = (SeedlessOnboardingController as jest.Mock).mock
      .calls[0][0] as {
      encryptor: ReturnType<typeof encryptorFactory>;
    };

    expect(encryptorFactorySpy).toHaveBeenCalledWith(600_000);
    expect(encryptor).toBe(defaultEncryptor);
  });

  it('uses the provided encryptor when supplied', () => {
    const messenger =
      seedlessOnboardingController.getMessenger(getRootMessenger());
    const encryptor = encryptorFactory(100_000);

    seedlessOnboardingController.init({
      state: undefined,
      messenger,
      options: {
        ...getSeedlessOnboardingOptions(),
        encryptor,
      },
    });

    expect(SeedlessOnboardingController).toHaveBeenCalledWith(
      expect.objectContaining({ encryptor }),
    );
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
