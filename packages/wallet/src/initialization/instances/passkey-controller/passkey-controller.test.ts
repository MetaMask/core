import { Messenger } from '@metamask/messenger';
import {
  PasskeyController,
  PasskeyControllerErrorCode,
  getDefaultPasskeyControllerState,
} from '@metamask/passkey-controller';
import type {
  PasskeyAuthenticationResponse,
  PasskeyRecord,
  PasskeyRegistrationResponse,
} from '@metamask/passkey-controller';

import { defaultConfigurations } from '../../defaults.js';
import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../../defaults.js';
import { passkeyController } from './passkey-controller.js';
import type { PasskeyControllerInstanceOptions } from './types.js';

const REQUIRED_OPTIONS: PasskeyControllerInstanceOptions = {
  expectedRPID: 'extension-id',
  expectedOrigin: 'https://extension.origin',
  rpName: 'MetaMask',
  getIsOnboardingCompleted: () => false,
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
  it('is registered as a default initialization configuration', () => {
    // Proves the controller is part of the default ensemble that `initialize()`
    // wires, without constructing a `Wallet` (which keeps this PR independent of
    // the constructor-options shape).
    expect(Object.values(defaultConfigurations)).toContain(passkeyController);
  });

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
        ...REQUIRED_OPTIONS,
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

  it('uses the provided getIsOnboardingCompleted callback', async () => {
    const messenger = passkeyController.getMessenger(getRootMessenger());
    const getIsOnboardingCompleted = jest.fn().mockReturnValue(true);

    const instance = passkeyController.init({
      state: undefined,
      messenger,
      options: {
        ...REQUIRED_OPTIONS,
        getIsOnboardingCompleted,
      },
    });

    await expect(
      instance.protectVaultKeyWithPasskey({
        registrationResponse: {} as PasskeyRegistrationResponse,
        authenticationResponse: {} as PasskeyAuthenticationResponse,
      }),
    ).rejects.toMatchObject({
      code: PasskeyControllerErrorCode.EnrollmentPasswordRequired,
    });

    expect(getIsOnboardingCompleted).toHaveBeenCalled();
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
