import type {
  KeyringControllerLockEvent,
  KeyringControllerUnlockEvent,
} from '@metamask/keyring-controller';
import {
  Messenger,
  type MessengerActions,
  type MessengerEvents,
} from '@metamask/messenger';

import { controllerName } from '../../src/constants';
import type {
  AllowedActions,
  AllowedEvents,
  SeedlessOnboardingControllerMessenger,
} from '../../src/types';

export type AllSeedlessOnboardingControllerActions =
  MessengerActions<SeedlessOnboardingControllerMessenger>;
export type AllSeedlessOnboardingControllerEvents =
  MessengerEvents<SeedlessOnboardingControllerMessenger>;

export const baseMessengerName = 'Root';

export type MockKeyringControllerMessenger = Messenger<
  'KeyringController',
  never,
  KeyringControllerLockEvent | KeyringControllerUnlockEvent
>;

/**
 * creates a custom seedless onboarding messenger, in case tests need different permissions
 *
 * @returns base messenger, and messenger. You can pass this into the mocks below to mock messenger calls
 */
export function createCustomSeedlessOnboardingMessenger() {
  // Create the root messenger
  const baseMessenger = new Messenger<
    typeof baseMessengerName,
    AllSeedlessOnboardingControllerActions,
    AllSeedlessOnboardingControllerEvents
  >({ namespace: baseMessengerName });

  const keyringControllerMessenger = new Messenger<
    'KeyringController',
    never,
    KeyringControllerLockEvent | KeyringControllerUnlockEvent,
    typeof baseMessenger
  >({ namespace: 'KeyringController', parent: baseMessenger });

  // Create the seedless onboarding controller messenger
  const messenger = new Messenger<
    typeof controllerName,
    AllSeedlessOnboardingControllerActions,
    AllSeedlessOnboardingControllerEvents,
    typeof baseMessenger
  >({
    namespace: controllerName,
    parent: baseMessenger,
  });

  // Delegate external actions/events
  keyringControllerMessenger.delegate({
    events: ['KeyringController:lock', 'KeyringController:unlock'],
    messenger: baseMessenger,
  });
  baseMessenger.delegate({
    events: ['KeyringController:lock', 'KeyringController:unlock'],
    messenger,
  });

  return {
    baseMessenger,
    messenger,
    keyringControllerMessenger,
  };
}

type OverrideMessengers = {
  baseMessenger: Messenger<
    typeof baseMessengerName,
    AllowedActions,
    AllowedEvents
  >;
  messenger: SeedlessOnboardingControllerMessenger;
  keyringControllerMessenger: MockKeyringControllerMessenger;
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
  const { baseMessenger, messenger, keyringControllerMessenger } =
    overrideMessengers ?? createCustomSeedlessOnboardingMessenger();

  const mockKeyringGetAccounts = jest.fn();
  const mockKeyringAddAccounts = jest.fn();

  const mockAccountsListAccounts = jest.fn();

  return {
    baseMessenger,
    messenger,
    keyringControllerMessenger,
    mockKeyringGetAccounts,
    mockKeyringAddAccounts,
    mockAccountsListAccounts,
  };
}
