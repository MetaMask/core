import { Messenger } from '@metamask/messenger';

import { bytesToBase64URL } from './encoding';
import {
  getDefaultPasskeyControllerState,
  PasskeyController,
} from './PasskeyController';
import type { PasskeyControllerMessenger } from './PasskeyController';
import type {
  PasskeyAuthenticationResponse,
  PasskeyRecord,
  PasskeyRegistrationResponse,
} from './types';

function getPasskeyMessenger(): PasskeyControllerMessenger {
  return new Messenger({
    namespace: 'PasskeyController',
  }) as PasskeyControllerMessenger;
}

function buildClientDataJSON(
  type: 'webauthn.create' | 'webauthn.get',
  challenge: string,
): string {
  return bytesToBase64URL(
    new TextEncoder().encode(
      JSON.stringify({ type, challenge, origin: 'https://example.test' }),
    ),
  );
}

function minimalRegistrationResponse(
  challenge: string,
  credentialId: string,
  overrides?: Partial<PasskeyRegistrationResponse>,
): PasskeyRegistrationResponse {
  return {
    id: credentialId,
    rawId: credentialId,
    response: {
      clientDataJSON: buildClientDataJSON('webauthn.create', challenge),
      attestationObject: bytesToBase64URL(new Uint8Array([0, 1, 2])),
    },
    type: 'public-key',
    ...overrides,
  };
}

function minimalAuthenticationResponse(
  challenge: string,
  credentialId: string,
  userHandle?: string,
  overrides?: Partial<PasskeyAuthenticationResponse>,
): PasskeyAuthenticationResponse {
  return {
    id: credentialId,
    rawId: credentialId,
    response: {
      clientDataJSON: buildClientDataJSON('webauthn.get', challenge),
      authenticatorData: bytesToBase64URL(new Uint8Array([0])),
      signature: bytesToBase64URL(new Uint8Array([0])),
      userHandle,
    },
    type: 'public-key',
    ...overrides,
  };
}

describe('PasskeyController', () => {
  describe('getDefaultPasskeyControllerState', () => {
    it('returns null passkeyRecord', () => {
      expect(getDefaultPasskeyControllerState()).toStrictEqual({
        passkeyRecord: null,
      });
    });
  });

  describe('constructor', () => {
    it('merges partial initial state with defaults', () => {
      const record: PasskeyRecord = {
        credentialId: 'QUJDREVGR2hJSktM',
        derivationMethod: 'userHandle',
        wrappedEncryptionKey: 'YQ==',
        iv: 'YWFhYWFhYWFhYQ==',
        encryptionSalt: 'salt',
      };
      const messenger = getPasskeyMessenger();
      const controller = new PasskeyController({
        messenger,
        state: { passkeyRecord: record },
      });
      expect(controller.state.passkeyRecord).toStrictEqual(record);
    });
  });

  describe('isPasskeyEnrolled', () => {
    it('returns false when no record is stored', () => {
      const controller = new PasskeyController({
        messenger: getPasskeyMessenger(),
      });
      expect(controller.isPasskeyEnrolled()).toBe(false);
    });

    it('is callable via messenger method action', () => {
      const messenger = getPasskeyMessenger();
      const controller = new PasskeyController({ messenger });
      expect(messenger.call('PasskeyController:isPasskeyEnrolled')).toBe(false);
      expect(controller.isPasskeyEnrolled()).toBe(false);
    });
  });

  describe('generatePasskeyAuthenticationOptions', () => {
    it('throws when passkey is not enrolled', () => {
      const controller = new PasskeyController({
        messenger: getPasskeyMessenger(),
      });
      expect(() => controller.generatePasskeyAuthenticationOptions()).toThrow(
        'Passkey is not enrolled',
      );
    });
  });

  describe('generatePasskeyRegistrationOptions', () => {
    it('returns options whose challenge matches a subsequent completion flow', async () => {
      const controller = new PasskeyController({
        messenger: getPasskeyMessenger(),
      });
      const options = controller.generatePasskeyRegistrationOptions({
        rp: { name: 'Test RP', id: 'example.com' },
      });
      expect(options.rp.name).toBe('Test RP');
      expect(options.rp.id).toBe('example.com');
      expect(options.challenge).toBeDefined();
      expect(options.user.id).toBeDefined();
      expect(options.extensions?.prf?.eval.first).toBeDefined();
      expect(options.hints).toStrictEqual(['client-device', 'hybrid']);
      expect(options.pubKeyCredParams.map((param) => param.alg)).toStrictEqual([
        -8, -7, -257,
      ]);

      const credentialId = 'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=';

      await controller.completePasskeyRegistration({
        registrationResponse: minimalRegistrationResponse(
          options.challenge,
          credentialId,
        ),
        encryptionKey: 'user-encryption-key-test',
        encryptionSalt: 'enc-salt',
      });

      expect(controller.isPasskeyEnrolled()).toBe(true);
      expect(controller.state.passkeyRecord?.credentialId).toBe(credentialId);
      expect(controller.state.passkeyRecord?.derivationMethod).toBe(
        'userHandle',
      );
    });
  });

  describe('completePasskeyRegistration', () => {
    it('throws when there is no active registration session', async () => {
      const controller = new PasskeyController({
        messenger: getPasskeyMessenger(),
      });
      await expect(
        controller.completePasskeyRegistration({
          registrationResponse: minimalRegistrationResponse('x', 'y'),
          encryptionKey: 'k',
          encryptionSalt: 's',
        }),
      ).rejects.toThrow('No active passkey registration session');
    });

    it('throws when challenge verification fails', async () => {
      const controller = new PasskeyController({
        messenger: getPasskeyMessenger(),
      });
      const options = controller.generatePasskeyRegistrationOptions();
      await expect(
        controller.completePasskeyRegistration({
          registrationResponse: minimalRegistrationResponse(
            'wrong-challenge',
            'QUJD',
          ),
          encryptionKey: 'k',
          encryptionSalt: 's',
        }),
      ).rejects.toThrow('Passkey registration challenge verification failed');
      expect(options.challenge).not.toBe('wrong-challenge');
    });

    it('uses prf derivation when extension results include PRF output', async () => {
      const controller = new PasskeyController({
        messenger: getPasskeyMessenger(),
      });
      const options = controller.generatePasskeyRegistrationOptions();
      const prfFirst = bytesToBase64URL(new Uint8Array(32).fill(9));

      await controller.completePasskeyRegistration({
        registrationResponse: minimalRegistrationResponse(
          options.challenge,
          'UFJGRW5jcnlwdGlvbktleUlkMTI=',
          {
            clientExtensionResults: {
              prf: { enabled: true, results: { first: prfFirst } },
            },
          },
        ),
        encryptionKey: 'vault-key-prf-path',
        encryptionSalt: 'salt-prf',
      });

      expect(controller.state.passkeyRecord?.derivationMethod).toBe('prf');
      expect(controller.state.passkeyRecord?.prfSalt).toBe(
        options.extensions?.prf?.eval.first,
      );
    });
  });

  describe('unwrapVaultEncryptionKey', () => {
    it('throws when there is no authentication session', async () => {
      const controller = new PasskeyController({
        messenger: getPasskeyMessenger(),
      });
      await expect(
        controller.unwrapVaultEncryptionKey(
          minimalAuthenticationResponse('c', 'id', 'uh'),
        ),
      ).rejects.toThrow('No active passkey authentication session');
    });

    it('throws when challenge verification fails', async () => {
      const controller = new PasskeyController({
        messenger: getPasskeyMessenger(),
      });
      const regOpts = controller.generatePasskeyRegistrationOptions();
      await controller.completePasskeyRegistration({
        registrationResponse: minimalRegistrationResponse(
          regOpts.challenge,
          'dmVyaWZ5Q3JlZA==',
        ),
        encryptionKey: 'k',
        encryptionSalt: 's',
      });
      const authOpts = controller.generatePasskeyAuthenticationOptions();

      await expect(
        controller.unwrapVaultEncryptionKey(
          minimalAuthenticationResponse(
            'wrong-challenge',
            'dmVyaWZ5Q3JlZA==',
            regOpts.user.id,
          ),
        ),
      ).rejects.toThrow('Passkey authentication challenge verification failed');
      expect(authOpts.challenge).not.toBe('wrong-challenge');
    });

    it('throws when userHandle derivation record lacks userHandle on assertion', async () => {
      const controller = new PasskeyController({
        messenger: getPasskeyMessenger(),
      });
      const regOpts = controller.generatePasskeyRegistrationOptions();
      await controller.completePasskeyRegistration({
        registrationResponse: minimalRegistrationResponse(
          regOpts.challenge,
          'dXNlckhhbmRsZUlk',
        ),
        encryptionKey: 'k',
        encryptionSalt: 's',
      });
      const authOpts = controller.generatePasskeyAuthenticationOptions();

      await expect(
        controller.unwrapVaultEncryptionKey(
          minimalAuthenticationResponse(
            authOpts.challenge,
            'dXNlckhhbmRsZUlk',
            undefined,
          ),
        ),
      ).rejects.toThrow('Passkey assertion missing required key material');
    });

    it('clears the authentication session after a successful unwrap', async () => {
      const controller = new PasskeyController({
        messenger: getPasskeyMessenger(),
      });
      const regOpts = controller.generatePasskeyRegistrationOptions();
      await controller.completePasskeyRegistration({
        registrationResponse: minimalRegistrationResponse(
          regOpts.challenge,
          'c2Vzc2lvbkNsZWFy',
        ),
        encryptionKey: 'secret',
        encryptionSalt: 's',
      });
      const authOpts = controller.generatePasskeyAuthenticationOptions();
      await controller.unwrapVaultEncryptionKey(
        minimalAuthenticationResponse(
          authOpts.challenge,
          'c2Vzc2lvbkNsZWFy',
          regOpts.user.id,
        ),
      );

      await expect(
        controller.unwrapVaultEncryptionKey(
          minimalAuthenticationResponse(
            'x',
            'c2Vzc2lvbkNsZWFy',
            regOpts.user.id,
          ),
        ),
      ).rejects.toThrow('No active passkey authentication session');
    });
  });

  describe('registration and authentication round-trip (userHandle)', () => {
    it('unwraps the same encryption key that was supplied at registration', async () => {
      const controller = new PasskeyController({
        messenger: getPasskeyMessenger(),
      });
      const regOptions = controller.generatePasskeyRegistrationOptions();
      const credentialId = 'Um91bmR0cmlwQ3JlZA==';
      const encryptionKey = 'roundtrip-encryption-key-value';

      await controller.completePasskeyRegistration({
        registrationResponse: minimalRegistrationResponse(
          regOptions.challenge,
          credentialId,
        ),
        encryptionKey,
        encryptionSalt: 'roundtrip-salt',
      });

      const authOptions = controller.generatePasskeyAuthenticationOptions();
      const out = await controller.unwrapVaultEncryptionKey(
        minimalAuthenticationResponse(
          authOptions.challenge,
          credentialId,
          regOptions.user.id,
        ),
      );

      expect(out).toBe(encryptionKey);
      expect(controller.state.passkeyRecord).not.toBeNull();
    });
  });

  describe('registration and authentication round-trip (prf)', () => {
    it('unwraps when auth response repeats the same PRF output', async () => {
      const controller = new PasskeyController({
        messenger: getPasskeyMessenger(),
      });
      const regOptions = controller.generatePasskeyRegistrationOptions();
      const credentialId = 'UFJGUm91bmR0cmlwSWQ=';
      const prfFirst = bytesToBase64URL(new Uint8Array(32).fill(42));
      const encryptionKey = 'prf-roundtrip-key';

      await controller.completePasskeyRegistration({
        registrationResponse: minimalRegistrationResponse(
          regOptions.challenge,
          credentialId,
          {
            clientExtensionResults: {
              prf: { results: { first: prfFirst } },
            },
          },
        ),
        encryptionKey,
        encryptionSalt: 'ps',
      });

      const authOptions = controller.generatePasskeyAuthenticationOptions();
      const out = await controller.unwrapVaultEncryptionKey(
        minimalAuthenticationResponse(
          authOptions.challenge,
          credentialId,
          undefined,
          {
            clientExtensionResults: {
              prf: { results: { first: prfFirst } },
            },
          },
        ),
      );

      expect(out).toBe(encryptionKey);
    });
  });

  describe('removePasskey', () => {
    it('clears stored record and resets enrollment', async () => {
      const controller = new PasskeyController({
        messenger: getPasskeyMessenger(),
      });
      const opts = controller.generatePasskeyRegistrationOptions();
      await controller.completePasskeyRegistration({
        registrationResponse: minimalRegistrationResponse(
          opts.challenge,
          'Y2xlYXI=',
        ),
        encryptionKey: 'k',
        encryptionSalt: 's',
      });
      expect(controller.isPasskeyEnrolled()).toBe(true);

      controller.removePasskey();
      expect(controller.isPasskeyEnrolled()).toBe(false);
      expect(controller.state.passkeyRecord).toBeNull();
    });
  });
});
