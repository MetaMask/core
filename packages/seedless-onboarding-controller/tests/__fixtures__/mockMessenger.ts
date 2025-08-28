import { Messenger } from '@metamask/base-controller';

import type {
  ExtractAvailableAction,
  ExtractAvailableEvent,
} from '../../../base-controller/tests/helpers';
import { type SeedlessOnboardingControllerMessenger } from '../../src/types';

/**
 * creates a custom seedless onboarding messenger, in case tests need different permissions
 *
 * @returns base messenger, and messenger. You can pass this into the mocks below to mock messenger calls
 */
export function createCustomSeedlessOnboardingMessenger() {
  const baseMessenger = new Messenger<
    ExtractAvailableAction<SeedlessOnboardingControllerMessenger>,
    ExtractAvailableEvent<SeedlessOnboardingControllerMessenger>
  >();
  const messenger = baseMessenger.getRestricted({
    name: 'SeedlessOnboardingController',
    allowedActions: [],
    allowedEvents: ['KeyringController:lock', 'KeyringController:unlock'],
  });

  return {
    baseMessenger,
    messenger,
  };
}

type OverrideMessengers = {
  baseMessenger: Messenger<
    ExtractAvailableAction<SeedlessOnboardingControllerMessenger>,
    ExtractAvailableEvent<SeedlessOnboardingControllerMessenger>
  >;
  messenger: SeedlessOnboardingControllerMessenger;
};

/**
 * Jest Mock Utility to generate a mock Seedless Onboarding Messenger
 *
 * @param overrideMessengers - override messengers if need to modify the underlying permissions
 * @returns series of mocks to actions that can be called
 */
export function mockSeedlessOnboardingMessenger(
  overrideMessengers?: OverrideMessengers,
) {
  const { baseMessenger, messenger } =
    overrideMessengers ?? createCustomSeedlessOnboardingMessenger();

  const mockKeyringGetAccounts = jest.fn();
  const mockKeyringAddAccounts = jest.fn();

  const mockAccountsListAccounts = jest.fn();

  return {
    baseMessenger,
    messenger,
    mockKeyringGetAccounts,
    mockKeyringAddAccounts,
    mockAccountsListAccounts,
  };
}
