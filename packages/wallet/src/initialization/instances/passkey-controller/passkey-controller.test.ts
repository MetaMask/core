import { Messenger } from '@metamask/messenger';
import {
  PasskeyController,
  getDefaultPasskeyControllerState,
} from '@metamask/passkey-controller';
import type { PasskeyRecord } from '@metamask/passkey-controller';

import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../../defaults';
import { passkeyController } from './passkey-controller';

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
  it('initializes a PasskeyController with default state', () => {
    const messenger = passkeyController.getMessenger(getRootMessenger());

    const instance = passkeyController.init({
      state: undefined,
      messenger,
      options: REQUIRED_OPTIONS,
    });

    expect(instance).toBeInstanceOf(PasskeyController);
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

  it('defaults userName and userDisplayName to rpName when omitted', () => {
    const messenger = passkeyController.getMessenger(getRootMessenger());

    const instance = passkeyController.init({
      state: undefined,
      messenger,
      options: REQUIRED_OPTIONS,
    });

    const options = instance.generateRegistrationOptions({
      prfAvailable: false,
    });

    expect(options.user).toStrictEqual({
      id: expect.any(String),
      name: 'MetaMask',
      displayName: 'MetaMask',
    });
  });

  it('uses custom passkey configuration options', () => {
    const messenger = passkeyController.getMessenger(getRootMessenger());

    const instance = passkeyController.init({
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

    const options = instance.generateRegistrationOptions({
      prfAvailable: false,
    });

    expect(options.rp).toStrictEqual({
      name: 'Custom RP',
      id: 'rp-id',
    });
    expect(options.user).toStrictEqual({
      id: expect.any(String),
      name: 'custom-user',
      displayName: 'Custom Display Name',
    });
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
