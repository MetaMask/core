import { Messenger } from '@metamask/messenger';

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

function createController(
  overrides?: Partial<ConstructorParameters<typeof PasskeyController>[0]>,
): PasskeyController {
  return new PasskeyController({
    messenger: getPasskeyMessenger(),
    rpID: TEST_RP_ID,
    expectedOrigin: TEST_ORIGIN,
    ...overrides,
  });
}

function minimalRegistrationResponse(
  overrides?: Partial<PasskeyRegistrationResponse>,
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
            challenge: TEST_CHALLENGE,
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
            challenge: TEST_CHALLENGE,
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
      const controller = new PasskeyController({ messenger });
      expect(messenger.call('PasskeyController:isPasskeyEnrolled')).toBe(false);
    });
  });

  describe('generateRegistrationOptions', () => {
    it('returns options with PRF extension and challenge', () => {
      const controller = createController();

      const options = controller.generateRegistrationOptions({
        rp: { name: 'Test RP', id: 'test.com' },
      });

      expect(options.rp).toStrictEqual({ name: 'Test RP', id: 'test.com' });
      expect(options.challenge).toBeDefined();
      expect(options.challenge.length).toBeGreaterThan(0);
      expect(options.pubKeyCredParams).toStrictEqual([
        { alg: -8, type: 'public-key' },
        { alg: -7, type: 'public-key' },
        { alg: -257, type: 'public-key' },
      ]);
      expect(options.attestation).toBe('direct');
      expect(
        (options.extensions as Record<string, unknown>)?.prf,
      ).toBeDefined();
    });

    it('defaults to metamask.io rpID and MetaMask rpName', () => {
      const controller = createController({ rpID: undefined });
      const options = controller.generateRegistrationOptions();
      expect(options.rp.id).toBe('metamask.io');
      expect(options.rp.name).toBe('MetaMask');
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

      controller.generateRegistrationOptions();
      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse({
          clientExtensionResults: prfResults(prfFirst, true),
        }),
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
    it('throws when there is no active registration session', async () => {
      const controller = createController();
      await expect(
        controller.protectVaultKeyWithPasskey({
          registrationResponse: minimalRegistrationResponse(),
          vaultKey: 'k',
        }),
      ).rejects.toThrow('No active passkey registration session');
    });

    it('throws when verification fails', async () => {
      mockVerifyRegistrationResponse.mockResolvedValue({
        verified: false,
      });

      const controller = createController();
      controller.generateRegistrationOptions();

      await expect(
        controller.protectVaultKeyWithPasskey({
          registrationResponse: minimalRegistrationResponse(),
          vaultKey: 'k',
        }),
      ).rejects.toThrow('Passkey registration verification failed');
    });

    it('stores passkey record with publicKey after successful verification', async () => {
      setupRegistrationMocks();
      const controller = createController();
      controller.generateRegistrationOptions();

      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse(),
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
      controller.generateRegistrationOptions();

      const prfFirst = bytesToBase64URL(new Uint8Array(32).fill(9));
      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse({
          clientExtensionResults: prfResults(prfFirst, true),
        }),
        vaultKey: 'vault-key-prf-path',
      });

      expect(controller.state.passkeyRecord?.derivationMethod).toBe('prf');
      expect(controller.state.passkeyRecord?.prfSalt).toBeDefined();
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

    it('throws when there is no authentication session', async () => {
      setupRegistrationMocks();
      const controller = createController();
      controller.generateRegistrationOptions();
      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse(),
        vaultKey: 'k',
      });

      await expect(
        controller.retrieveVaultKeyWithPasskey(
          minimalAuthenticationResponse('uh'),
        ),
      ).rejects.toThrow('No active passkey authentication session');
    });

    it('throws when verification fails', async () => {
      setupRegistrationMocks();
      const controller = createController();
      controller.generateRegistrationOptions();
      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse(),
        vaultKey: 'k',
      });

      mockVerifyAuthenticationResponse.mockResolvedValue({
        verified: false,
        authenticationInfo: {},
      });

      controller.generateAuthenticationOptions();

      await expect(
        controller.retrieveVaultKeyWithPasskey(
          minimalAuthenticationResponse('uh'),
        ),
      ).rejects.toThrow('Passkey authentication verification failed');
    });

    it('clears the authentication session after successful retrieval (prf)', async () => {
      setupRegistrationMocks();
      setupAuthenticationMocks();

      const controller = createController();
      const prfFirst = bytesToBase64URL(new Uint8Array(32).fill(99));

      controller.generateRegistrationOptions();
      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse({
          clientExtensionResults: prfResults(prfFirst),
        }),
        vaultKey: 'secret',
      });

      controller.generateAuthenticationOptions();
      await controller.retrieveVaultKeyWithPasskey(
        minimalAuthenticationResponse(undefined, {
          clientExtensionResults: prfResults(prfFirst),
        }),
      );

      await expect(
        controller.retrieveVaultKeyWithPasskey(
          minimalAuthenticationResponse(undefined, {
            clientExtensionResults: prfResults(prfFirst),
          }),
        ),
      ).rejects.toThrow('No active passkey authentication session');
    });
  });

  describe('registration and authentication round-trip (userHandle)', () => {
    it('retrieves vault key using userHandle derivation', async () => {
      setupRegistrationMocks();
      setupAuthenticationMocks();

      const controller = createController();
      const vaultKey = 'userhandle-roundtrip-key';

      controller.generateRegistrationOptions();

      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse(),
        vaultKey,
      });

      expect(controller.state.passkeyRecord?.derivationMethod).toBe(
        'userHandle',
      );

      controller.generateAuthenticationOptions();
      await expect(
        controller.retrieveVaultKeyWithPasskey(
          minimalAuthenticationResponse('bWlzbWF0Y2hlZFVzZXJIYW5kbGU'),
        ),
      ).rejects.toThrow('aes/gcm');

      controller.generateAuthenticationOptions();
      await expect(
        controller.retrieveVaultKeyWithPasskey(
          minimalAuthenticationResponse(undefined),
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

      controller.generateRegistrationOptions();
      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse({
          clientExtensionResults: prfResults(prfFirst),
        }),
        vaultKey,
      });

      controller.generateAuthenticationOptions();
      const out = await controller.retrieveVaultKeyWithPasskey(
        minimalAuthenticationResponse(undefined, {
          clientExtensionResults: prfResults(prfFirst),
        }),
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

      controller.generateRegistrationOptions();
      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse({
          clientExtensionResults: prfResults(prfFirst),
        }),
        vaultKey: beforeKey,
      });

      controller.generateAuthenticationOptions();
      const afterKey = 'vault-key-after-password';
      await controller.renewVaultKeyProtection({
        authenticationResponse: minimalAuthenticationResponse(undefined, {
          clientExtensionResults: prfResults(prfFirst),
        }),
        oldVaultKey: beforeKey,
        newVaultKey: afterKey,
      });

      controller.generateAuthenticationOptions();
      const unwrapped = await controller.retrieveVaultKeyWithPasskey(
        minimalAuthenticationResponse(undefined, {
          clientExtensionResults: prfResults(prfFirst),
        }),
      );
      expect(unwrapped).toBe(afterKey);
    });

    it('throws when the old vault key does not match', async () => {
      setupRegistrationMocks();
      setupAuthenticationMocks();

      const controller = createController();
      const prfFirst = bytesToBase64URL(new Uint8Array(32).fill(42));

      controller.generateRegistrationOptions();
      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse({
          clientExtensionResults: prfResults(prfFirst),
        }),
        vaultKey: 'actual-wrapped-key',
      });

      controller.generateAuthenticationOptions();

      await expect(
        controller.renewVaultKeyProtection({
          authenticationResponse: minimalAuthenticationResponse(undefined, {
            clientExtensionResults: prfResults(prfFirst),
          }),
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
      setupRegistrationMocks();
      const controller = createController();
      controller.generateRegistrationOptions();
      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse(),
        vaultKey: 'k',
      });
      expect(controller.isPasskeyEnrolled()).toBe(true);

      controller.removePasskey();
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

      controller.generateRegistrationOptions();
      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse(),
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

      controller.generateRegistrationOptions();
      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse({
          clientExtensionResults: prfResults(prfFirst),
        }),
        vaultKey: 'k',
      });

      controller.generateAuthenticationOptions();

      try {
        await controller.retrieveVaultKeyWithPasskey(
          minimalAuthenticationResponse(undefined, {
            clientExtensionResults: prfResults(prfFirst),
          }),
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

      controller.generateRegistrationOptions();
      await controller.protectVaultKeyWithPasskey({
        registrationResponse: minimalRegistrationResponse({
          clientExtensionResults: prfResults(prfFirst),
        }),
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

      controller.generateAuthenticationOptions();
      await controller.retrieveVaultKeyWithPasskey(
        minimalAuthenticationResponse(undefined, {
          clientExtensionResults: prfResults(prfFirst),
        }),
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

      controller.generateAuthenticationOptions();
      await controller.retrieveVaultKeyWithPasskey(
        minimalAuthenticationResponse(undefined, {
          clientExtensionResults: prfResults(prfFirst),
        }),
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
});
