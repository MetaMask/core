import type {
  KeyringControllerLockEvent,
  KeyringControllerUnlockEvent,
} from '@metamask/keyring-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';

import { controllerName } from '../../src/constants';
import type { SeedlessOnboardingControllerMessenger } from '../../src/types';

export type AllSeedlessOnboardingControllerActions =
  MessengerActions<SeedlessOnboardingControllerMessenger>;
export type AllSeedlessOnboardingControllerEvents =
  MessengerEvents<SeedlessOnboardingControllerMessenger>;

export type MockKeyringControllerMessenger = Messenger<
  'KeyringController',
  never,
  KeyringControllerLockEvent | KeyringControllerUnlockEvent
>;

export type RootMessenger = Messenger<
  MockAnyNamespace,
  AllSeedlessOnboardingControllerActions,
  | AllSeedlessOnboardingControllerEvents
  | MessengerEvents<MockKeyringControllerMessenger>
>;

/**
 * creates a custom seedless onboarding messenger, in case tests need different permissions
 *
 * @returns base messenger, and messenger. You can pass this into the mocks below to mock messenger calls
 */
export function createCustomSeedlessOnboardingMessenger(): {
  baseMessenger: RootMessenger;
  messenger: SeedlessOnboardingControllerMessenger;
  keyringControllerMessenger: MockKeyringControllerMessenger;
} {
  // Create the root messenger
  const baseMessenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });

  const keyringControllerMessenger = new Messenger<
    'KeyringController',
    never,
    KeyringControllerLockEvent | KeyringControllerUnlockEvent,
    RootMessenger
  >({ namespace: 'KeyringController', parent: baseMessenger });

  // Create the seedless onboarding controller messenger
  const messenger = new Messenger<
    typeof controllerName,
    AllSeedlessOnboardingControllerActions,
    AllSeedlessOnboardingControllerEvents,
    RootMessenger
  >({
    namespace: controllerName,
    parent: baseMessenger,
  });

  return {
    baseMessenger,
    messenger,
    keyringControllerMessenger,
  };
}

type OverrideMessengers = {
  baseMessenger: RootMessenger;
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
): {
  baseMessenger: RootMessenger;
  messenger: SeedlessOnboardingControllerMessenger;
  keyringControllerMessenger: MockKeyringControllerMessenger;
  mockKeyringGetAccounts: jest.Mock;
  mockKeyringAddAccounts: jest.Mock;
  mockAccountsListAccounts: jest.Mock;
} {
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
