import { Messenger } from '@metamask/messenger';

import { SESSION_MAX_AGE_MS, WEBAUTHN_TIMEOUT_MS } from './ceremony-manager';
import {
  getDefaultPasskeyControllerState,
  PasskeyController,
} from './PasskeyController';
import type { PasskeyControllerMessenger } from './PasskeyController';
import type { PasskeyRecord, PrfClientExtensionResults } from './types';
import type {
  PasskeyRegistrationResponse,
  PasskeyAuthenticationResponse,
} from './webauthn';

type ExtOutputsWithPrf = Record<string, unknown> & PrfClientExtensionResults;

function prfResults(first: string, enabled?: boolean): ExtOutputsWithPrf {
  if (enabled === undefined) {
    return { prf: { results: { first } } } as ExtOutputsWithPrf;
  }
  return { prf: { enabled, results: { first } } } as ExtOutputsWithPrf;
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockVerifyRegistrationResponse = jest.fn();
const mockVerifyAuthenticationResponse = jest.fn();

jest.mock('./webauthn', () => ({
  ...jest.requireActual('./webauthn'),
  verifyRegistrationResponse: (...args: unknown[]): unknown =>
    mockVerifyRegistrationResponse(...args),
  verifyAuthenticationResponse: (...args: unknown[]): unknown =>
    mockVerifyAuthenticationResponse(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bytesToBase64URL(bytes: Uint8Array): string {
  const binary = String.fromCharCode(...bytes);
  return btoa(binary)
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_')
    .replace(/[=]+$/u, '');
}

const TEST_RP_ID = 'example.com';
const TEST_ORIGIN = 'https://example.com';
const TEST_CREDENTIAL_ID = 'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo';
const TEST_PUBLIC_KEY = bytesToBase64URL(new Uint8Array(32).fill(0xaa));
const TEST_CHALLENGE = 'dGVzdC1jaGFsbGVuZ2U';

function getPasskeyMessenger(): PasskeyControllerMessenger {
  return new Messenger({
    namespace: 'PasskeyController',
  }) as PasskeyControllerMessenger;
}

const TEST_RP_NAME = 'Test RP';

function createController(
  overrides?: Partial<ConstructorParameters<typeof PasskeyController>[0]>,
): PasskeyController {
  return new PasskeyController({
    messenger: getPasskeyMessenger(),
    rpID: TEST_RP_ID,
    rpName: TEST_RP_NAME,
    expectedOrigin: TEST_ORIGIN,
    ...overrides,
  });
}

function minimalRegistrationResponse(
  overrides?: Partial<PasskeyRegistrationResponse>,
  challenge: string = TEST_CHALLENGE,
): PasskeyRegistrationResponse {
  return {
    id: TEST_CREDENTIAL_ID,
    rawId: TEST_CREDENTIAL_ID,
    type: 'public-key',
    response: {
      clientDataJSON: bytesToBase64URL(
        new TextEncoder().encode(
          JSON.stringify({
            type: 'webauthn.create',
            challenge,
            origin: TEST_ORIGIN,
          }),
        ),
      ),
      attestationObject: bytesToBase64URL(new Uint8Array([0, 1, 2])),
    },
    clientExtensionResults: {},
    authenticatorAttachment: 'platform',
    ...overrides,
  } as PasskeyRegistrationResponse;
}

function minimalAuthenticationResponse(
  userHandle?: string,
  overrides?: Partial<PasskeyAuthenticationResponse>,
  challenge: string = TEST_CHALLENGE,
): PasskeyAuthenticationResponse {
  return {
    id: TEST_CREDENTIAL_ID,
    rawId: TEST_CREDENTIAL_ID,
    type: 'public-key',
    response: {
      clientDataJSON: bytesToBase64URL(
        new TextEncoder().encode(
          JSON.stringify({
            type: 'webauthn.get',
            challenge,
            origin: TEST_ORIGIN,
          }),
        ),
      ),
      authenticatorData: bytesToBase64URL(new Uint8Array([0])),
      signature: bytesToBase64URL(new Uint8Array([0])),
      ...(userHandle === undefined ? {} : { userHandle }),
    },
    clientExtensionResults: {},
    authenticatorAttachment: 'platform',
    ...overrides,
  } as PasskeyAuthenticationResponse;
}

/**
 * Sets up mocks for a full registration + protect flow.
 */
function setupRegistrationMocks(): void {
  mockVerifyRegistrationResponse.mockResolvedValue({
    verified: true,
    registrationInfo: {
      credentialId: TEST_CREDENTIAL_ID,
      publicKey: new Uint8Array(32).fill(0xaa),
      counter: 0,
      transports: ['internal'],
      aaguid: '00000000-0000-0000-0000-000000000000',
      attestationFormat: 'none',
      userVerified: true,
    },
  });
}

function setupAuthenticationMocks(): void {
  mockVerifyAuthenticationResponse.mockResolvedValue({
    verified: true,
    authenticationInfo: {
      credentialId: TEST_CREDENTIAL_ID,
      newCounter: 0,
      userVerified: true,
      origin: TEST_ORIGIN,
      rpID: TEST_RP_ID,
    },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PasskeyController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

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
        credentialId: TEST_CREDENTIAL_ID,
        derivationMethod: 'userHandle',
        encryptedVaultKey: 'YQ==',
        iv: 'YWFhYWFhYWFhYQ==',
        publicKey: TEST_PUBLIC_KEY,
        counter: 0,
        transports: ['internal'],
      };
      const controller = createController({
        state: { passkeyRecord: record },
      });
      expect(controller.state.passkeyRecord).toStrictEqual(record);
    });
  });

  describe('isPasskeyEnrolled', () => {
    it('returns false when no record is stored', () => {
      const controller = createController();
      expect(controller.isPasskeyEnrolled()).toBe(false);
    });

    it('is callable via messenger method action', () => {
      const messenger = getPasskeyMessenger();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const controller = new PasskeyController({
        messenger,
        rpID: TEST_RP_ID,
        rpName: TEST_RP_NAME,
        expectedOrigin: TEST_ORIGIN,
      });
      expect(messenger.call('PasskeyController:isPasskeyEnrolled')).toBe(false);
    });
  });

  describe('generateRegistrationOptions', () => {
    it('returns options with PRF extension and challenge', () => {
      const controller = createController();

      const options = controller.generateRegistrationOptions();

      expect(options.rp).toStrictEqual({
        name: TEST_RP_NAME,
        id: TEST_RP_ID,
      });
      expect(options.challenge).toBeDefined();
      expect(options.challenge.length).toBeGreaterThan(0);
      expect(options.pubKeyCredParams).toStrictEqual([
        { alg: -8, type: 'public-key' },
        { alg: -7, type: 'public-key' },
        { alg: -257, type: 'public-key' },
      ]);
      expect(options.attestation).toBe('direct');
      expect(options.timeout).toBe(WEBAUTHN_TIMEOUT_MS);
      expect(
        (options.extensions as Record<string, unknown>)?.prf,
      ).toBeDefined();
    });

    it('uses rpID and rpName from constructor', () => {
      const controller = createController({
        rpID: 'custom-rp.io',
        rpName: 'Custom RP',
      });
      const options = controller.generateRegistrationOptions();
      expect(options.rp.id).toBe('custom-rp.io');
      expect(options.rp.name).toBe('Custom RP');
    });

    it('includes PRF extension when prfAvailable is true', () => {
      const controller = createController();
      const options = controller.generateRegistrationOptions({
        prfAvailable: true,
      });
      expect(
        (options.extensions as Record<string, unknown>)?.prf,
      ).toBeDefined();
    });

    it('includes PRF extension when prfAvailable is undefined (default)', () => {
      const controller = createController();
      const options = controller.generateRegistrationOptions();
      expect(
        (options.extensions as Record<string, unknown>)?.prf,
      ).toBeDefined();
    });

    it('omits PRF extension when prfAvailable is false', () => {
      const controller = createController();
      const options = controller.generateRegistrationOptions({
        prfAvailable: false,
      });
      expect(options.extensions).toBeUndefined();
    });

    it('uses userHandle derivation for the full round-trip when prfAvailable is false', async () => {
      setupRegistrationMocks();
      setupAuthenticationMocks();

      const controller = createController();
      const vaultKey = 'no-prf-vault-key';

      const regOptions = controller.generateRegistrationOptions({
        prfAvailable: false,
      });
      expect(regOptions.extensions).toBeUndefined();

      const userHandle = regOptions.user.id;
      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse(
          undefined,
          regOptions.challenge,
        ),
        vaultKey,
      });

      expect(controller.state.passkeyRecord?.derivationMethod).toBe(
        'userHandle',
      );
      expect(controller.state.passkeyRecord?.prfSalt).toBeUndefined();

      const authOptions = controller.generateAuthenticationOptions();
      expect(authOptions.extensions).toStrictEqual({});

      const retrieved = await controller.retrieveVaultKeyWithPasskey(
        minimalAuthenticationResponse(
          userHandle,
          undefined,
          authOptions.challenge,
        ),
      );
      expect(retrieved).toBe(vaultKey);
    });
  });

  describe('generateAuthenticationOptions', () => {
    it('throws when passkey is not enrolled', () => {
      const controller = createController();
      expect(() => controller.generateAuthenticationOptions()).toThrow(
        'Passkey is not enrolled',
      );
    });

    it('returns options with PRF for prf-enrolled credentials', async () => {
      setupRegistrationMocks();
      setupAuthenticationMocks();

      const prfFirst = bytesToBase64URL(new Uint8Array(32).fill(9));
      const controller = createController();

      const regOpts = controller.generateRegistrationOptions();
      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse(
          {
            clientExtensionResults: prfResults(prfFirst, true),
          },
          regOpts.challenge,
        ),
        vaultKey: 'k',
      });

      const authOpts = controller.generateAuthenticationOptions();

      expect(authOpts.rpId).toBe(TEST_RP_ID);
      expect(authOpts.allowCredentials).toStrictEqual([
        expect.objectContaining({
          id: TEST_CREDENTIAL_ID,
          type: 'public-key',
        }),
      ]);
      expect(
        (authOpts.extensions as Record<string, unknown>)?.prf,
      ).toBeDefined();
    });
  });

  describe('protectVaultKeyWithPasskey', () => {
    it('throws when there is no active registration ceremony', async () => {
      const controller = createController();
      await expect(
        controller.protectVaultKeyWithPasskey({
          registrationResponse: minimalRegistrationResponse(),
          vaultKey: 'k',
        }),
      ).rejects.toThrow('No active passkey registration ceremony');
    });

    it('throws when verification fails', async () => {
      mockVerifyRegistrationResponse.mockResolvedValue({
        verified: false,
      });

      const controller = createController();
      const regOpts = controller.generateRegistrationOptions();

      await expect(
        controller.protectVaultKeyWithPasskey({
          registrationResponse: minimalRegistrationResponse(
            undefined,
            regOpts.challenge,
          ),
          vaultKey: 'k',
        }),
      ).rejects.toThrow('Passkey registration verification failed');
    });

    it('propagates when verifyRegistrationResponse rejects and clears ceremony state', async () => {
      mockVerifyRegistrationResponse.mockRejectedValue(
        new Error('verify-error'),
      );

      const controller = createController();
      const regOpts = controller.generateRegistrationOptions();

      await expect(
        controller.protectVaultKeyWithPasskey({
          registrationResponse: minimalRegistrationResponse(
            undefined,
            regOpts.challenge,
          ),
          vaultKey: 'k',
        }),
      ).rejects.toThrow('verify-error');

      await expect(
        controller.protectVaultKeyWithPasskey({
          registrationResponse: minimalRegistrationResponse(
            undefined,
            regOpts.challenge,
          ),
          vaultKey: 'k',
        }),
      ).rejects.toThrow('No active passkey registration ceremony');
    });

    it('stores passkey record with publicKey after successful verification', async () => {
      setupRegistrationMocks();
      const controller = createController();
      const regOpts = controller.generateRegistrationOptions();

      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse(
          undefined,
          regOpts.challenge,
        ),
        vaultKey: 'test-vault-key',
      });

      expect(controller.isPasskeyEnrolled()).toBe(true);
      const record = controller.state.passkeyRecord;
      expect(record?.credentialId).toBe(TEST_CREDENTIAL_ID);
      expect(record?.publicKey).toBe(TEST_PUBLIC_KEY);
      expect(record?.transports).toStrictEqual(['internal']);
      expect(record?.derivationMethod).toBe('userHandle');
    });

    it('uses prf derivation when extension results include PRF output', async () => {
      setupRegistrationMocks();
      const controller = createController();
      const regOpts = controller.generateRegistrationOptions();

      const prfFirst = bytesToBase64URL(new Uint8Array(32).fill(9));
      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse(
          {
            clientExtensionResults: prfResults(prfFirst, true),
          },
          regOpts.challenge,
        ),
        vaultKey: 'vault-key-prf-path',
      });

      expect(controller.state.passkeyRecord?.derivationMethod).toBe('prf');
      expect(controller.state.passkeyRecord?.prfSalt).toBeDefined();
    });

    it('uses userHandle derivation when PRF was requested but registration returns no PRF output bytes', async () => {
      setupRegistrationMocks();
      setupAuthenticationMocks();

      const controller = createController();
      const vaultKey = 'vault-prf-requested-no-output';

      const regOptions = controller.generateRegistrationOptions({
        prfAvailable: true,
      });
      expect(
        (regOptions.extensions as Record<string, unknown>)?.prf,
      ).toBeDefined();

      const userHandle = regOptions.user.id;
      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse(
          {
            clientExtensionResults: {
              prf: { enabled: true },
            } as ExtOutputsWithPrf,
          },
          regOptions.challenge,
        ),
        vaultKey,
      });

      expect(controller.state.passkeyRecord?.derivationMethod).toBe(
        'userHandle',
      );
      expect(controller.state.passkeyRecord?.prfSalt).toBeUndefined();

      const authOptions = controller.generateAuthenticationOptions();
      expect(authOptions.extensions).toStrictEqual({});

      const retrieved = await controller.retrieveVaultKeyWithPasskey(
        minimalAuthenticationResponse(
          userHandle,
          undefined,
          authOptions.challenge,
        ),
      );
      expect(retrieved).toBe(vaultKey);
    });
  });

  describe('retrieveVaultKeyWithPasskey', () => {
    it('throws when passkey is not enrolled', async () => {
      setupAuthenticationMocks();
      const controller = createController();
      await expect(
        controller.retrieveVaultKeyWithPasskey(
          minimalAuthenticationResponse('uh'),
        ),
      ).rejects.toThrow('Passkey is not enrolled');
    });

    it('throws when there is no authentication ceremony', async () => {
      setupRegistrationMocks();
      const controller = createController();
      const regOpts = controller.generateRegistrationOptions();
      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse(
          undefined,
          regOpts.challenge,
        ),
        vaultKey: 'k',
      });

      await expect(
        controller.retrieveVaultKeyWithPasskey(
          minimalAuthenticationResponse('uh'),
        ),
      ).rejects.toThrow('No active passkey authentication ceremony');
    });

    it('throws when verification fails', async () => {
      setupRegistrationMocks();
      const controller = createController();
      const regOpts = controller.generateRegistrationOptions();
      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse(
          undefined,
          regOpts.challenge,
        ),
        vaultKey: 'k',
      });

      mockVerifyAuthenticationResponse.mockResolvedValue({
        verified: false,
        authenticationInfo: {},
      });

      const authOpts = controller.generateAuthenticationOptions();

      await expect(
        controller.retrieveVaultKeyWithPasskey(
          minimalAuthenticationResponse('uh', undefined, authOpts.challenge),
        ),
      ).rejects.toThrow('Passkey authentication verification failed');
    });

    it('clears the authentication ceremony after successful retrieval (prf)', async () => {
      setupRegistrationMocks();
      setupAuthenticationMocks();

      const controller = createController();
      const prfFirst = bytesToBase64URL(new Uint8Array(32).fill(99));

      const regOpts = controller.generateRegistrationOptions();
      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse(
          {
            clientExtensionResults: prfResults(prfFirst),
          },
          regOpts.challenge,
        ),
        vaultKey: 'secret',
      });

      const authOpts = controller.generateAuthenticationOptions();
      await controller.retrieveVaultKeyWithPasskey(
        minimalAuthenticationResponse(
          undefined,
          {
            clientExtensionResults: prfResults(prfFirst),
          },
          authOpts.challenge,
        ),
      );

      await expect(
        controller.retrieveVaultKeyWithPasskey(
          minimalAuthenticationResponse(undefined, {
            clientExtensionResults: prfResults(prfFirst),
          }),
        ),
      ).rejects.toThrow('No active passkey authentication ceremony');
    });
  });

  describe('verifyPasskeyAuthentication', () => {
    it('returns false when passkey is not enrolled', async () => {
      setupAuthenticationMocks();
      const controller = createController();
      expect(
        await controller.verifyPasskeyAuthentication(
          minimalAuthenticationResponse('uh'),
        ),
      ).toBe(false);
    });

    it('returns false when there is no authentication ceremony', async () => {
      setupRegistrationMocks();
      const controller = createController();
      const regOpts = controller.generateRegistrationOptions();
      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse(
          undefined,
          regOpts.challenge,
        ),
        vaultKey: 'k',
      });

      expect(
        await controller.verifyPasskeyAuthentication(
          minimalAuthenticationResponse('uh'),
        ),
      ).toBe(false);
    });

    it('returns false when verification fails', async () => {
      setupRegistrationMocks();
      const controller = createController();
      const regOpts = controller.generateRegistrationOptions();
      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse(
          undefined,
          regOpts.challenge,
        ),
        vaultKey: 'k',
      });

      mockVerifyAuthenticationResponse.mockResolvedValue({
        verified: false,
        authenticationInfo: {},
      });

      const authOpts = controller.generateAuthenticationOptions();

      expect(
        await controller.verifyPasskeyAuthentication(
          minimalAuthenticationResponse('uh', undefined, authOpts.challenge),
        ),
      ).toBe(false);
    });

    it('returns true on successful authentication (prf)', async () => {
      setupRegistrationMocks();
      setupAuthenticationMocks();

      const controller = createController();
      const prfFirst = bytesToBase64URL(new Uint8Array(32).fill(7));
      const vaultKey = 'verify-bool-ok';

      const regOpts = controller.generateRegistrationOptions();
      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse(
          {
            clientExtensionResults: prfResults(prfFirst),
          },
          regOpts.challenge,
        ),
        vaultKey,
      });

      const authOpts = controller.generateAuthenticationOptions();
      expect(
        await controller.verifyPasskeyAuthentication(
          minimalAuthenticationResponse(
            undefined,
            {
              clientExtensionResults: prfResults(prfFirst),
            },
            authOpts.challenge,
          ),
        ),
      ).toBe(true);
    });
  });

  describe('registration and authentication round-trip (userHandle)', () => {
    it('retrieves vault key using userHandle derivation', async () => {
      setupRegistrationMocks();
      setupAuthenticationMocks();

      const controller = createController();
      const vaultKey = 'userhandle-roundtrip-key';

      const regOpts = controller.generateRegistrationOptions();

      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse(
          undefined,
          regOpts.challenge,
        ),
        vaultKey,
      });

      expect(controller.state.passkeyRecord?.derivationMethod).toBe(
        'userHandle',
      );

      let authOpts = controller.generateAuthenticationOptions();
      await expect(
        controller.retrieveVaultKeyWithPasskey(
          minimalAuthenticationResponse(
            'bWlzbWF0Y2hlZFVzZXJIYW5kbGU',
            undefined,
            authOpts.challenge,
          ),
        ),
      ).rejects.toThrow('aes/gcm');

      authOpts = controller.generateAuthenticationOptions();
      await expect(
        controller.retrieveVaultKeyWithPasskey(
          minimalAuthenticationResponse(
            undefined,
            undefined,
            authOpts.challenge,
          ),
        ),
      ).rejects.toThrow('Passkey assertion missing required key material');
    });
  });

  describe('registration and authentication round-trip (prf)', () => {
    it('retrieves vault key when auth response repeats the same PRF output', async () => {
      setupRegistrationMocks();
      setupAuthenticationMocks();

      const controller = createController();
      const prfFirst = bytesToBase64URL(new Uint8Array(32).fill(42));
      const vaultKey = 'prf-roundtrip-key';

      const regOpts = controller.generateRegistrationOptions();
      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse(
          {
            clientExtensionResults: prfResults(prfFirst),
          },
          regOpts.challenge,
        ),
        vaultKey,
      });

      const authOpts = controller.generateAuthenticationOptions();
      const out = await controller.retrieveVaultKeyWithPasskey(
        minimalAuthenticationResponse(
          undefined,
          {
            clientExtensionResults: prfResults(prfFirst),
          },
          authOpts.challenge,
        ),
      );

      expect(out).toBe(vaultKey);
    });
  });

  describe('renewVaultKeyProtection', () => {
    it('throws when passkey is not enrolled', async () => {
      setupAuthenticationMocks();
      const controller = createController();
      await expect(
        controller.renewVaultKeyProtection({
          authenticationResponse: minimalAuthenticationResponse('uh'),
          oldVaultKey: 'old',
          newVaultKey: 'new',
        }),
      ).rejects.toThrow('Passkey is not enrolled');
    });

    it('updates the passkey wrap when before/after vault keys match', async () => {
      setupRegistrationMocks();
      setupAuthenticationMocks();

      const controller = createController();
      const prfFirst = bytesToBase64URL(new Uint8Array(32).fill(42));
      const beforeKey = 'vault-key-before-password';

      const regOpts = controller.generateRegistrationOptions();
      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse(
          {
            clientExtensionResults: prfResults(prfFirst),
          },
          regOpts.challenge,
        ),
        vaultKey: beforeKey,
      });

      let authOpts = controller.generateAuthenticationOptions();
      const afterKey = 'vault-key-after-password';
      await controller.renewVaultKeyProtection({
        authenticationResponse: minimalAuthenticationResponse(
          undefined,
          {
            clientExtensionResults: prfResults(prfFirst),
          },
          authOpts.challenge,
        ),
        oldVaultKey: beforeKey,
        newVaultKey: afterKey,
      });

      authOpts = controller.generateAuthenticationOptions();
      const unwrapped = await controller.retrieveVaultKeyWithPasskey(
        minimalAuthenticationResponse(
          undefined,
          {
            clientExtensionResults: prfResults(prfFirst),
          },
          authOpts.challenge,
        ),
      );
      expect(unwrapped).toBe(afterKey);
    });

    it('throws when the old vault key does not match', async () => {
      setupRegistrationMocks();
      setupAuthenticationMocks();

      const controller = createController();
      const prfFirst = bytesToBase64URL(new Uint8Array(32).fill(42));

      const regOpts = controller.generateRegistrationOptions();
      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse(
          {
            clientExtensionResults: prfResults(prfFirst),
          },
          regOpts.challenge,
        ),
        vaultKey: 'actual-wrapped-key',
      });

      const authOpts = controller.generateAuthenticationOptions();

      await expect(
        controller.renewVaultKeyProtection({
          authenticationResponse: minimalAuthenticationResponse(
            undefined,
            {
              clientExtensionResults: prfResults(prfFirst),
            },
            authOpts.challenge,
          ),
          oldVaultKey: 'wrong-expected-key',
          newVaultKey: 'new-key',
        }),
      ).rejects.toThrow(
        'Passkey authentication does not match the current vault key',
      );
    });

    it('throws when there is no authentication ceremony', async () => {
      setupRegistrationMocks();
      setupAuthenticationMocks();

      const controller = createController();
      const prfFirst = bytesToBase64URL(new Uint8Array(32).fill(42));

      const regOpts = controller.generateRegistrationOptions();
      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse(
          {
            clientExtensionResults: prfResults(prfFirst),
          },
          regOpts.challenge,
        ),
        vaultKey: 'wrapped',
      });

      await expect(
        controller.renewVaultKeyProtection({
          authenticationResponse: minimalAuthenticationResponse(
            undefined,
            {
              clientExtensionResults: prfResults(prfFirst),
            },
            TEST_CHALLENGE,
          ),
          oldVaultKey: 'wrapped',
          newVaultKey: 'new',
        }),
      ).rejects.toThrow('No active passkey authentication ceremony');
    });

    it('removes authentication ceremony when verification fails during renewal', async () => {
      setupRegistrationMocks();
      setupAuthenticationMocks();

      const controller = createController();
      const prfFirst = bytesToBase64URL(new Uint8Array(32).fill(42));

      const regOpts = controller.generateRegistrationOptions();
      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse(
          {
            clientExtensionResults: prfResults(prfFirst),
          },
          regOpts.challenge,
        ),
        vaultKey: 'wrapped',
      });

      mockVerifyAuthenticationResponse.mockResolvedValue({
        verified: false,
        authenticationInfo: {},
      });

      const authOpts = controller.generateAuthenticationOptions();
      await expect(
        controller.renewVaultKeyProtection({
          authenticationResponse: minimalAuthenticationResponse(
            undefined,
            {
              clientExtensionResults: prfResults(prfFirst),
            },
            authOpts.challenge,
          ),
          oldVaultKey: 'wrapped',
          newVaultKey: 'new',
        }),
      ).rejects.toThrow('Passkey authentication verification failed');

      mockVerifyAuthenticationResponse.mockResolvedValue({
        verified: true,
        authenticationInfo: {
          credentialId: TEST_CREDENTIAL_ID,
          newCounter: 0,
          userVerified: true,
          origin: TEST_ORIGIN,
          rpID: TEST_RP_ID,
        },
      });

      const authOptsRetry = controller.generateAuthenticationOptions();
      await controller.renewVaultKeyProtection({
        authenticationResponse: minimalAuthenticationResponse(
          undefined,
          {
            clientExtensionResults: prfResults(prfFirst),
          },
          authOptsRetry.challenge,
        ),
        oldVaultKey: 'wrapped',
        newVaultKey: 'rotated',
      });

      const authOptsFinal = controller.generateAuthenticationOptions();
      const unwrapped = await controller.retrieveVaultKeyWithPasskey(
        minimalAuthenticationResponse(
          undefined,
          {
            clientExtensionResults: prfResults(prfFirst),
          },
          authOptsFinal.challenge,
        ),
      );
      expect(unwrapped).toBe('rotated');
    });
  });

  describe('removePasskey', () => {
    it('clears stored record and resets enrollment', async () => {
      setupRegistrationMocks();
      const controller = createController();
      const regOpts = controller.generateRegistrationOptions();
      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse(
          undefined,
          regOpts.challenge,
        ),
        vaultKey: 'k',
      });
      expect(controller.isPasskeyEnrolled()).toBe(true);

      controller.removePasskey();
      expect(controller.isPasskeyEnrolled()).toBe(false);
      expect(controller.state.passkeyRecord).toBeNull();
    });
  });

  describe('clearState', () => {
    it('clears stored record and resets enrollment', async () => {
      setupRegistrationMocks();
      const controller = createController();
      const regOpts = controller.generateRegistrationOptions();
      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse(
          undefined,
          regOpts.challenge,
        ),
        vaultKey: 'k',
      });
      expect(controller.isPasskeyEnrolled()).toBe(true);

      controller.clearState();
      expect(controller.isPasskeyEnrolled()).toBe(false);
      expect(controller.state.passkeyRecord).toBeNull();
    });
  });

  describe('verifyRegistrationResponse parameters', () => {
    it('passes expectedOrigin and expectedRPID to verification', async () => {
      setupRegistrationMocks();
      const controller = createController({
        rpID: 'custom-rp.com',
        expectedOrigin: 'chrome-extension://abc123',
      });

      const regOpts = controller.generateRegistrationOptions();
      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse(
          undefined,
          regOpts.challenge,
        ),
        vaultKey: 'k',
      });

      expect(mockVerifyRegistrationResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          expectedOrigin: 'chrome-extension://abc123',
          expectedRPID: 'custom-rp.com',
          requireUserVerification: false,
        }),
      );
    });
  });

  describe('verifyAuthenticationResponse parameters', () => {
    it('passes credential with publicKey and stored counter to verification', async () => {
      setupRegistrationMocks();
      setupAuthenticationMocks();

      const controller = createController();
      const prfFirst = bytesToBase64URL(new Uint8Array(32).fill(42));

      const regOpts = controller.generateRegistrationOptions();
      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse(
          {
            clientExtensionResults: prfResults(prfFirst),
          },
          regOpts.challenge,
        ),
        vaultKey: 'k',
      });

      const authOpts = controller.generateAuthenticationOptions();

      try {
        await controller.retrieveVaultKeyWithPasskey(
          minimalAuthenticationResponse(
            undefined,
            {
              clientExtensionResults: prfResults(prfFirst),
            },
            authOpts.challenge,
          ),
        );
      } catch {
        // key derivation result doesn't matter here
      }

      expect(mockVerifyAuthenticationResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          expectedOrigin: TEST_ORIGIN,
          expectedRPID: TEST_RP_ID,
          credential: expect.objectContaining({
            id: TEST_CREDENTIAL_ID,
            counter: 0,
          }),
          requireUserVerification: false,
        }),
      );
    });

    it('persists newCounter from authentication and passes it on next auth', async () => {
      setupRegistrationMocks();
      const controller = createController();
      const prfFirst = bytesToBase64URL(new Uint8Array(32).fill(42));

      const regOpts = controller.generateRegistrationOptions();
      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse(
          {
            clientExtensionResults: prfResults(prfFirst),
          },
          regOpts.challenge,
        ),
        vaultKey: 'k',
      });

      expect(controller.state.passkeyRecord?.counter).toBe(0);

      mockVerifyAuthenticationResponse.mockResolvedValue({
        verified: true,
        authenticationInfo: {
          credentialId: TEST_CREDENTIAL_ID,
          newCounter: 5,
          userVerified: true,
          origin: TEST_ORIGIN,
          rpID: TEST_RP_ID,
        },
      });

      let authOpts = controller.generateAuthenticationOptions();
      await controller.retrieveVaultKeyWithPasskey(
        minimalAuthenticationResponse(
          undefined,
          {
            clientExtensionResults: prfResults(prfFirst),
          },
          authOpts.challenge,
        ),
      );

      expect(controller.state.passkeyRecord?.counter).toBe(5);

      mockVerifyAuthenticationResponse.mockResolvedValue({
        verified: true,
        authenticationInfo: {
          credentialId: TEST_CREDENTIAL_ID,
          newCounter: 10,
          userVerified: true,
          origin: TEST_ORIGIN,
          rpID: TEST_RP_ID,
        },
      });

      authOpts = controller.generateAuthenticationOptions();
      await controller.retrieveVaultKeyWithPasskey(
        minimalAuthenticationResponse(
          undefined,
          {
            clientExtensionResults: prfResults(prfFirst),
          },
          authOpts.challenge,
        ),
      );

      expect(mockVerifyAuthenticationResponse).toHaveBeenLastCalledWith(
        expect.objectContaining({
          credential: expect.objectContaining({
            counter: 5,
          }),
        }),
      );
      expect(controller.state.passkeyRecord?.counter).toBe(10);
    });
  });

  describe('concurrent WebAuthn ceremonies', () => {
    it('completes authentication using the first challenge after a second generateAuthenticationOptions', async () => {
      setupRegistrationMocks();
      setupAuthenticationMocks();

      const controller = createController();
      const prfFirst = bytesToBase64URL(new Uint8Array(32).fill(7));
      const vaultKey = 'multi-auth-ceremony';

      const regOpts = controller.generateRegistrationOptions();
      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse(
          {
            clientExtensionResults: prfResults(prfFirst),
          },
          regOpts.challenge,
        ),
        vaultKey,
      });

      const authOpts1 = controller.generateAuthenticationOptions();
      const authOpts2 = controller.generateAuthenticationOptions();

      const retrieved = await controller.retrieveVaultKeyWithPasskey(
        minimalAuthenticationResponse(
          undefined,
          {
            clientExtensionResults: prfResults(prfFirst),
          },
          authOpts1.challenge,
        ),
      );

      expect(retrieved).toBe(vaultKey);

      const authOpts3 = controller.generateAuthenticationOptions();
      expect(
        await controller.retrieveVaultKeyWithPasskey(
          minimalAuthenticationResponse(
            undefined,
            {
              clientExtensionResults: prfResults(prfFirst),
            },
            authOpts2.challenge,
          ),
        ),
      ).toBe(vaultKey);

      expect(
        await controller.retrieveVaultKeyWithPasskey(
          minimalAuthenticationResponse(
            undefined,
            {
              clientExtensionResults: prfResults(prfFirst),
            },
            authOpts3.challenge,
          ),
        ),
      ).toBe(vaultKey);
    });

    it('completes registration using the first challenge after a second generateRegistrationOptions', async () => {
      setupRegistrationMocks();
      const controller = createController();
      const vaultKey = 'multi-reg-ceremony';

      const regOpts1 = controller.generateRegistrationOptions();
      controller.generateRegistrationOptions();

      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse(
          undefined,
          regOpts1.challenge,
        ),
        vaultKey,
      });

      expect(controller.isPasskeyEnrolled()).toBe(true);
      expect(controller.state.passkeyRecord).not.toBeNull();
    });
  });

  describe('ceremony TTL', () => {
    it('drops expired registration ceremonies before protectVaultKeyWithPasskey', async () => {
      jest.useFakeTimers('modern');
      jest.setSystemTime(1_000_000);
      setupRegistrationMocks();
      const controller = createController();
      const regOpts = controller.generateRegistrationOptions();

      jest.setSystemTime(1_000_000 + SESSION_MAX_AGE_MS + 1);

      await expect(
        controller.protectVaultKeyWithPasskey({
          registrationResponse: minimalRegistrationResponse(
            undefined,
            regOpts.challenge,
          ),
          vaultKey: 'k',
        }),
      ).rejects.toThrow('No active passkey registration ceremony');

      jest.useRealTimers();
    });

    it('removes authentication ceremony entry when verification fails', async () => {
      setupRegistrationMocks();
      setupAuthenticationMocks();
      const controller = createController();
      const regOpts = controller.generateRegistrationOptions();
      const userHandle = regOpts.user.id;
      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse(
          undefined,
          regOpts.challenge,
        ),
        vaultKey: 'k',
      });

      mockVerifyAuthenticationResponse.mockResolvedValue({
        verified: false,
        authenticationInfo: {},
      });

      const authOpts = controller.generateAuthenticationOptions();

      await expect(
        controller.retrieveVaultKeyWithPasskey(
          minimalAuthenticationResponse(
            userHandle,
            undefined,
            authOpts.challenge,
          ),
        ),
      ).rejects.toThrow('Passkey authentication verification failed');

      mockVerifyAuthenticationResponse.mockResolvedValue({
        verified: true,
        authenticationInfo: {
          credentialId: TEST_CREDENTIAL_ID,
          newCounter: 0,
          userVerified: true,
          origin: TEST_ORIGIN,
          rpID: TEST_RP_ID,
        },
      });

      const authOptsRetry = controller.generateAuthenticationOptions();
      expect(
        await controller.retrieveVaultKeyWithPasskey(
          minimalAuthenticationResponse(
            userHandle,
            undefined,
            authOptsRetry.challenge,
          ),
        ),
      ).toBe('k');
    });
  });
});
