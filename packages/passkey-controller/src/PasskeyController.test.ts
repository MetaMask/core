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
        encryptedVaultKey: 'YQ==',
        iv: 'YWFhYWFhYWFhYQ==',
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

  describe('generateAuthenticationOptions', () => {
    it('throws when passkey is not enrolled', () => {
      const controller = new PasskeyController({
        messenger: getPasskeyMessenger(),
      });
      expect(() => controller.generateAuthenticationOptions()).toThrow(
        'Passkey is not enrolled',
      );
    });
  });

  describe('generateRegistrationOptions', () => {
    it('returns options whose challenge matches a subsequent completion flow', async () => {
      const controller = new PasskeyController({
        messenger: getPasskeyMessenger(),
      });
      const options = controller.generateRegistrationOptions({
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

      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse(
          options.challenge,
          credentialId,
        ),
        vaultKey: 'user-encryption-key-test',
      });

      expect(controller.isPasskeyEnrolled()).toBe(true);
      expect(controller.state.passkeyRecord?.credentialId).toBe(credentialId);
      expect(controller.state.passkeyRecord?.derivationMethod).toBe(
        'userHandle',
      );
    });
  });

  describe('protectVaultKeyWithPasskey', () => {
    it('throws when there is no active registration session', async () => {
      const controller = new PasskeyController({
        messenger: getPasskeyMessenger(),
      });
      await expect(
        controller.protectVaultKeyWithPasskey({
          registrationResponse: minimalRegistrationResponse('x', 'y'),
          vaultKey: 'k',
        }),
      ).rejects.toThrow('No active passkey registration session');
    });

    it('throws when challenge verification fails', async () => {
      const controller = new PasskeyController({
        messenger: getPasskeyMessenger(),
      });
      const options = controller.generateRegistrationOptions();
      await expect(
        controller.protectVaultKeyWithPasskey({
          registrationResponse: minimalRegistrationResponse(
            'wrong-challenge',
            'QUJD',
          ),
          vaultKey: 'k',
        }),
      ).rejects.toThrow('Passkey registration challenge verification failed');
      expect(options.challenge).not.toBe('wrong-challenge');
    });

    it('uses prf derivation when extension results include PRF output', async () => {
      const controller = new PasskeyController({
        messenger: getPasskeyMessenger(),
      });
      const options = controller.generateRegistrationOptions();
      const prfFirst = bytesToBase64URL(new Uint8Array(32).fill(9));

      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse(
          options.challenge,
          'UFJGRW5jcnlwdGlvbktleUlkMTI=',
          {
            clientExtensionResults: {
              prf: { enabled: true, results: { first: prfFirst } },
            },
          },
        ),
        vaultKey: 'vault-key-prf-path',
      });

      expect(controller.state.passkeyRecord?.derivationMethod).toBe('prf');
      expect(controller.state.passkeyRecord?.prfSalt).toBe(
        options.extensions?.prf?.eval.first,
      );
    });
  });

  describe('retrieveVaultKeyWithPasskey', () => {
    it('throws when there is no authentication session', async () => {
      const controller = new PasskeyController({
        messenger: getPasskeyMessenger(),
      });
      const regOpts = controller.generateRegistrationOptions();
      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse(
          regOpts.challenge,
          'bm9TZXNzaW9u',
        ),
        vaultKey: 'k',
      });
      await expect(
        controller.retrieveVaultKeyWithPasskey(
          minimalAuthenticationResponse('c', 'bm9TZXNzaW9u', 'uh'),
        ),
      ).rejects.toThrow('No active passkey authentication session');
    });

    it('throws when challenge verification fails', async () => {
      const controller = new PasskeyController({
        messenger: getPasskeyMessenger(),
      });
      const regOpts = controller.generateRegistrationOptions();
      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse(
          regOpts.challenge,
          'dmVyaWZ5Q3JlZA==',
        ),
        vaultKey: 'k',
      });
      const authOpts = controller.generateAuthenticationOptions();

      await expect(
        controller.retrieveVaultKeyWithPasskey(
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
      const regOpts = controller.generateRegistrationOptions();
      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse(
          regOpts.challenge,
          'dXNlckhhbmRsZUlk',
        ),
        vaultKey: 'k',
      });
      const authOpts = controller.generateAuthenticationOptions();

      await expect(
        controller.retrieveVaultKeyWithPasskey(
          minimalAuthenticationResponse(
            authOpts.challenge,
            'dXNlckhhbmRsZUlk',
            undefined,
          ),
        ),
      ).rejects.toThrow('Passkey assertion missing required key material');
    });

    it('clears the authentication session after a successful retrieval', async () => {
      const controller = new PasskeyController({
        messenger: getPasskeyMessenger(),
      });
      const regOpts = controller.generateRegistrationOptions();
      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse(
          regOpts.challenge,
          'c2Vzc2lvbkNsZWFy',
        ),
        vaultKey: 'secret',
      });
      const authOpts = controller.generateAuthenticationOptions();
      await controller.retrieveVaultKeyWithPasskey(
        minimalAuthenticationResponse(
          authOpts.challenge,
          'c2Vzc2lvbkNsZWFy',
          regOpts.user.id,
        ),
      );

      await expect(
        controller.retrieveVaultKeyWithPasskey(
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
    it('retrieves the same vault key that was supplied at registration', async () => {
      const controller = new PasskeyController({
        messenger: getPasskeyMessenger(),
      });
      const regOptions = controller.generateRegistrationOptions();
      const credentialId = 'Um91bmR0cmlwQ3JlZA==';
      const vaultKey = 'roundtrip-vault-key-value';

      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse(
          regOptions.challenge,
          credentialId,
        ),
        vaultKey,
      });

      const authOptions = controller.generateAuthenticationOptions();
      const out = await controller.retrieveVaultKeyWithPasskey(
        minimalAuthenticationResponse(
          authOptions.challenge,
          credentialId,
          regOptions.user.id,
        ),
      );

      expect(out).toBe(vaultKey);
      expect(controller.state.passkeyRecord).not.toBeNull();
    });
  });

  describe('registration and authentication round-trip (prf)', () => {
    it('retrieves vault key when auth response repeats the same PRF output', async () => {
      const controller = new PasskeyController({
        messenger: getPasskeyMessenger(),
      });
      const regOptions = controller.generateRegistrationOptions();
      const credentialId = 'UFJGUm91bmR0cmlwSWQ=';
      const prfFirst = bytesToBase64URL(new Uint8Array(32).fill(42));
      const vaultKey = 'prf-roundtrip-key';

      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse(
          regOptions.challenge,
          credentialId,
          {
            clientExtensionResults: {
              prf: { results: { first: prfFirst } },
            },
          },
        ),
        vaultKey,
      });

      const authOptions = controller.generateAuthenticationOptions();
      const out = await controller.retrieveVaultKeyWithPasskey(
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

      expect(out).toBe(vaultKey);
    });
  });

  describe('renewVaultKeyProtection', () => {
    it('updates the passkey wrap when before/after vault keys match the ceremony', async () => {
      const controller = new PasskeyController({
        messenger: getPasskeyMessenger(),
      });
      const regOptions = controller.generateRegistrationOptions();
      const credentialId = 'UmV3cmFwQ3JlZGVudGlhbA==';
      const beforeKey = 'vault-key-before-password';

      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse(
          regOptions.challenge,
          credentialId,
        ),
        vaultKey: beforeKey,
      });

      const authOptions = controller.generateAuthenticationOptions();
      const authResponse = minimalAuthenticationResponse(
        authOptions.challenge,
        credentialId,
        regOptions.user.id,
      );
      const afterKey = 'vault-key-after-password';

      await controller.renewVaultKeyProtection({
        authenticationResponse: authResponse,
        oldVaultKey: beforeKey,
        newVaultKey: afterKey,
      });

      const authOptions2 = controller.generateAuthenticationOptions();
      const unwrapped = await controller.retrieveVaultKeyWithPasskey(
        minimalAuthenticationResponse(
          authOptions2.challenge,
          credentialId,
          regOptions.user.id,
        ),
      );
      expect(unwrapped).toBe(afterKey);
    });

    it('throws when the live vault key does not match the protected vault key', async () => {
      const controller = new PasskeyController({
        messenger: getPasskeyMessenger(),
      });
      const regOptions = controller.generateRegistrationOptions();
      const credentialId = 'bWlzbWF0Y2hLZXk=';

      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse(
          regOptions.challenge,
          credentialId,
        ),
        vaultKey: 'actual-wrapped-key',
      });

      const authOptions = controller.generateAuthenticationOptions();

      await expect(
        controller.renewVaultKeyProtection({
          authenticationResponse: minimalAuthenticationResponse(
            authOptions.challenge,
            credentialId,
            regOptions.user.id,
          ),
          oldVaultKey: 'wrong-expected-key',
          newVaultKey: 'new-key',
        }),
      ).rejects.toThrow(
        'Passkey authentication does not match the current vault key',
      );
    });
  });

  describe('removePasskey', () => {
    it('clears stored record and resets enrollment', async () => {
      const controller = new PasskeyController({
        messenger: getPasskeyMessenger(),
      });
      const opts = controller.generateRegistrationOptions();
      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse(
          opts.challenge,
          'Y2xlYXI=',
        ),
        vaultKey: 'k',
      });
      expect(controller.isPasskeyEnrolled()).toBe(true);

      controller.removePasskey();
      expect(controller.isPasskeyEnrolled()).toBe(false);
      expect(controller.state.passkeyRecord).toBeNull();
    });
  });
});
