import { Messenger } from '@metamask/messenger';
import {
  PasskeyController,
  getDefaultPasskeyControllerState,
} from '@metamask/passkey-controller';
import type { PasskeyRecord } from '@metamask/passkey-controller';

import { defaultConfigurations } from '../../defaults';
import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../../defaults';
import { passkeyController } from './passkey-controller';

const { PasskeyController: ActualPasskeyController } = jest.requireActual(
  '@metamask/passkey-controller',
);

jest.mock('@metamask/passkey-controller', () => ({
  ...jest.requireActual('@metamask/passkey-controller'),
  PasskeyController: jest.fn(),
}));

const REQUIRED_OPTIONS = {
  expectedRPID: 'extension-id',
  expectedOrigin: 'https://extension.origin',
  rpName: 'MetaMask',
};

/**
 * Creates a root messenger for use in tests.
 *
 * @returns A root messenger.
 */
function getRootMessenger(): RootMessenger<DefaultActions, DefaultEvents> {
  return new Messenger({ namespace: 'Root' });
}

describe('passkeyController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (PasskeyController as jest.Mock).mockImplementation(
      (...args: unknown[]) => new ActualPasskeyController(...args),
    );
  });

  it('is registered as a default initialization configuration', () => {
    expect(Object.values(defaultConfigurations)).toContain(passkeyController);
  });

  it('initializes a PasskeyController with default state', () => {
    const messenger = passkeyController.getMessenger(getRootMessenger());

    const instance = passkeyController.init({
      state: undefined,
      messenger,
      options: REQUIRED_OPTIONS,
    });

    expect(instance).toBeInstanceOf(ActualPasskeyController);
    expect(instance.state).toStrictEqual(getDefaultPasskeyControllerState());
  });

  it('forwards the provided state to the controller', () => {
    const messenger = passkeyController.getMessenger(getRootMessenger());

    const passkeyRecord: PasskeyRecord = {
      credential: {
        id: 'credential-id',
        publicKey: 'public-key',
        counter: 0,
        transports: ['internal'],
        aaguid: '00000000-0000-0000-0000-000000000000',
      },
      encryptedVaultKey: {
        ciphertext: 'YQ==',
        iv: 'YWFhYWFhYWFhYQ==',
      },
      keyDerivation: { method: 'userHandle' },
    };

    const instance = passkeyController.init({
      state: { passkeyRecord },
      messenger,
      options: REQUIRED_OPTIONS,
    });

    expect(instance.state.passkeyRecord).toStrictEqual(passkeyRecord);
  });

  it('applies default rpName, userName, and userDisplayName when omitted', () => {
    const messenger = passkeyController.getMessenger(getRootMessenger());

    passkeyController.init({
      state: undefined,
      messenger,
      options: REQUIRED_OPTIONS,
    });

    expect(PasskeyController).toHaveBeenCalledWith(
      expect.objectContaining({
        rpId: undefined,
        rpName: 'MetaMask',
        userName: 'MetaMask Wallet',
        userDisplayName: 'MetaMask Wallet',
        expectedRPID: REQUIRED_OPTIONS.expectedRPID,
        expectedOrigin: REQUIRED_OPTIONS.expectedOrigin,
      }),
    );
  });

  it('forwards custom passkey configuration options', () => {
    const messenger = passkeyController.getMessenger(getRootMessenger());

    passkeyController.init({
      state: undefined,
      messenger,
      options: {
        expectedRPID: ['extension-id', 'other-id'],
        expectedOrigin: ['https://a.example', 'https://b.example'],
        rpId: 'rp-id',
        rpName: 'Custom RP',
        userName: 'custom-user',
        userDisplayName: 'Custom Display Name',
      },
    });

    expect(PasskeyController).toHaveBeenCalledWith(
      expect.objectContaining({
        rpId: 'rp-id',
        rpName: 'Custom RP',
        userName: 'custom-user',
        userDisplayName: 'Custom Display Name',
        expectedRPID: ['extension-id', 'other-id'],
        expectedOrigin: ['https://a.example', 'https://b.example'],
      }),
    );
  });

  it('exposes its state through the root messenger', () => {
    const rootMessenger = getRootMessenger();
    const messenger = passkeyController.getMessenger(rootMessenger);

    passkeyController.init({
      state: undefined,
      messenger,
      options: REQUIRED_OPTIONS,
    });

    expect(rootMessenger.call('PasskeyController:getState')).toStrictEqual(
      getDefaultPasskeyControllerState(),
    );
  });
});
