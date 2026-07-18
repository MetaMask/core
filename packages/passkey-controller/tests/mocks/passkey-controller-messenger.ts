import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';

import type { PasskeyControllerMessenger } from '../../src/types';
import { controllerName } from '../../src/constants';

type AllPasskeyControllerActions = MessengerActions<PasskeyControllerMessenger>;

type AllPasskeyControllerEvents = MessengerEvents<PasskeyControllerMessenger>;

export type RootPasskeyControllerMessenger = Messenger<
  MockAnyNamespace,
  AllPasskeyControllerActions,
  AllPasskeyControllerEvents
>;

const PASSKEY_CONTROLLER_ALLOWED_KEYRING_ACTIONS = [
  'KeyringController:verifyPassword',
  'KeyringController:exportEncryptionKey',
  'KeyringController:submitEncryptionKey',
  'KeyringController:changePassword',
  'KeyringController:exportSeedPhrase',
  'KeyringController:exportAccount',
] as const;

export type PasskeyControllerKeyringActionMocks = {
  verifyPassword?: jest.Mock;
  exportEncryptionKey?: jest.Mock;
  submitEncryptionKey?: jest.Mock;
  changePassword?: jest.Mock;
  exportSeedPhrase?: jest.Mock;
  exportAccount?: jest.Mock;
};

/**
 * Creates a restricted {@link PasskeyControllerMessenger} with mock KeyringController
 * action handlers registered on a parent messenger.
 *
 * @param mocks - Optional jest mocks for KeyringController actions.
 * @returns Root and restricted messengers for {@link PasskeyController} tests.
 */
export function createMockPasskeyControllerMessenger(
  mocks: PasskeyControllerKeyringActionMocks = {},
): {
  rootMessenger: RootPasskeyControllerMessenger;
  messenger: PasskeyControllerMessenger;
  mocks: Required<PasskeyControllerKeyringActionMocks>;
} {
  const resolvedMocks: Required<PasskeyControllerKeyringActionMocks> = {
    verifyPassword: mocks.verifyPassword ?? jest.fn(),
    exportEncryptionKey:
      mocks.exportEncryptionKey ?? jest.fn().mockResolvedValue('vault-key'),
    submitEncryptionKey: mocks.submitEncryptionKey ?? jest.fn(),
    changePassword: mocks.changePassword ?? jest.fn(),
    exportSeedPhrase:
      mocks.exportSeedPhrase ?? jest.fn().mockResolvedValue(new Uint8Array()),
    exportAccount:
      mocks.exportAccount ?? jest.fn().mockResolvedValue('0xabc'),
  };

  const rootMessenger = new Messenger<
    MockAnyNamespace,
    AllPasskeyControllerActions,
    AllPasskeyControllerEvents
  >({
    namespace: MOCK_ANY_NAMESPACE,
  });

  rootMessenger.registerActionHandler(
    'KeyringController:verifyPassword',
    resolvedMocks.verifyPassword,
  );
  rootMessenger.registerActionHandler(
    'KeyringController:exportEncryptionKey',
    resolvedMocks.exportEncryptionKey,
  );
  rootMessenger.registerActionHandler(
    'KeyringController:submitEncryptionKey',
    resolvedMocks.submitEncryptionKey,
  );
  rootMessenger.registerActionHandler(
    'KeyringController:changePassword',
    resolvedMocks.changePassword,
  );
  rootMessenger.registerActionHandler(
    'KeyringController:exportSeedPhrase',
    resolvedMocks.exportSeedPhrase,
  );
  rootMessenger.registerActionHandler(
    'KeyringController:exportAccount',
    resolvedMocks.exportAccount,
  );

  const messenger = new Messenger<
    typeof controllerName,
    AllPasskeyControllerActions,
    AllPasskeyControllerEvents,
    RootPasskeyControllerMessenger
  >({
    namespace: controllerName,
    parent: rootMessenger,
  });

  rootMessenger.delegate({
    messenger,
    events: [],
    actions: [...PASSKEY_CONTROLLER_ALLOWED_KEYRING_ACTIONS],
  });

  return {
    rootMessenger,
    messenger,
    mocks: resolvedMocks,
  };
}
