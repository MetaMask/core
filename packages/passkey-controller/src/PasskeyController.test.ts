import { Messenger } from '@metamask/messenger';

import { CEREMONY_MAX_AGE_MS, WEBAUTHN_TIMEOUT_MS } from './ceremony-manager';
import {
  PasskeyControllerErrorCode,
  PasskeyControllerErrorMessage,
} from './constants';
import { PasskeyControllerError } from './errors';
import {
  getDefaultPasskeyControllerState,
  passkeyControllerSelectors,
  PasskeyController,
} from './PasskeyController';
import type {
  PasskeyControllerMessenger,
  PasskeyControllerState,
} from './PasskeyController';
import type { PasskeyRecord, PrfClientExtensionResults } from './types';
import * as passkeyCrypto from './utils/crypto';
import type {
  PasskeyRegistrationResponse,
  PasskeyAuthenticationResponse,
} from './webauthn/types';

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

jest.mock('./webauthn/verify-registration-response', () => ({
  ...jest.requireActual('./webauthn/verify-registration-response'),
  verifyRegistrationResponse: (...args: unknown[]): unknown =>
    mockVerifyRegistrationResponse(...args),
}));

jest.mock('./webauthn/verify-authentication-response', () => ({
  ...jest.requireActual('./webauthn/verify-authentication-response'),
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
    expectedRPID: TEST_RP_ID,
    rpId: TEST_RP_ID,
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

async function enrollWithPostRegistrationAuth(
  controller: PasskeyController,
  options: {
    registrationResponse: PasskeyRegistrationResponse;
    vaultKey: string;
    /** Assertion userHandle when using userHandle wrapping (must match registration `user.id`). */
    userHandle?: string;
    /** PRF (or other) extension results on the post-registration authentication response. */
    authClientExtensionResults?: Record<string, unknown>;
  },
): Promise<void> {
  const {
    registrationResponse,
    vaultKey,
    userHandle,
    authClientExtensionResults,
  } = options;
  const authOpts = controller.generatePostRegistrationAuthenticationOptions({
    registrationResponse,
  });
  const authResp = minimalAuthenticationResponse(
    userHandle,
    {
      clientExtensionResults: authClientExtensionResults ?? {},
    },
    authOpts.challenge,
  );
  await controller.protectVaultKeyWithPasskey({
    registrationResponse,
    authenticationResponse: authResp,
    vaultKey,
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
    it('allows expectedRPID to be an empty array', () => {
      expect(
        () =>
          new PasskeyController({
            messenger: getPasskeyMessenger(),
            expectedRPID: [],
            rpName: TEST_RP_NAME,
            expectedOrigin: TEST_ORIGIN,
          }),
      ).not.toThrow();
    });

    it('merges partial initial state with defaults', () => {
      const record: PasskeyRecord = {
        credential: {
          id: TEST_CREDENTIAL_ID,
          publicKey: TEST_PUBLIC_KEY,
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
      expect(options.attestation).toBe('none');
      expect(options.timeout).toBe(WEBAUTHN_TIMEOUT_MS);
      expect(
        (options.extensions as Record<string, unknown>)?.prf,
      ).toBeDefined();
    });

    it('uses expectedRPID and rpName from constructor', () => {
      const controller = createController({
        expectedRPID: 'custom-rp.io',
        rpName: 'Custom RP',
        rpId: undefined,
      });
      const options = controller.generateRegistrationOptions();
      expect(options.rp).toStrictEqual({
        name: 'Custom RP',
        id: undefined,
      });
    });

    it('uses optional rpId for WebAuthn rp.id when set', () => {
      const controller = createController({
        expectedRPID: ['first.example', 'second.example'],
        rpId: 'second.example',
      });
      const options = controller.generateRegistrationOptions();
      expect(options.rp.id).toBe('second.example');
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

    it('throws when passkey is already enrolled', async () => {
      setupRegistrationMocks();
      setupAuthenticationMocks();
      const controller = createController();
      const regOptions = controller.generateRegistrationOptions();
      await enrollWithPostRegistrationAuth(controller, {
        registrationResponse: minimalRegistrationResponse(
          undefined,
          regOptions.challenge,
        ),
        vaultKey: 'vault-key',
        userHandle: regOptions.user.id,
      });
      expect(controller.isPasskeyEnrolled()).toBe(true);
      expect(() => controller.generateRegistrationOptions()).toThrow(
        PasskeyControllerErrorMessage.AlreadyEnrolled,
      );
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
      await enrollWithPostRegistrationAuth(controller, {
        registrationResponse: minimalRegistrationResponse(
          undefined,
          regOptions.challenge,
        ),
        vaultKey,
        userHandle,
      });

      expect(controller.state.passkeyRecord?.keyDerivation).toStrictEqual({
        method: 'userHandle',
      });

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

  describe('generatePostRegistrationAuthenticationOptions', () => {
    it('throws when there is no active registration ceremony', () => {
      const controller = createController();
      expect(() =>
        controller.generatePostRegistrationAuthenticationOptions({
          registrationResponse: minimalRegistrationResponse(),
        }),
      ).toThrow(PasskeyControllerErrorMessage.NoRegistrationCeremony);
    });
  });

  describe('generateAuthenticationOptions', () => {
    it('throws when passkey is not enrolled', () => {
      const controller = createController();
      expect(() => controller.generateAuthenticationOptions()).toThrow(
        PasskeyControllerErrorMessage.NotEnrolled,
      );
    });

    it('returns options with PRF for prf-enrolled credentials', async () => {
      setupRegistrationMocks();
      setupAuthenticationMocks();

      const prfFirst = bytesToBase64URL(new Uint8Array(32).fill(9));
      const controller = createController();

      const regOpts = controller.generateRegistrationOptions();
      await enrollWithPostRegistrationAuth(controller, {
        registrationResponse: minimalRegistrationResponse(
          {
            clientExtensionResults: prfResults(prfFirst, true),
          },
          regOpts.challenge,
        ),
        vaultKey: 'k',
        authClientExtensionResults: prfResults(prfFirst, true),
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
          authenticationResponse: minimalAuthenticationResponse(),
          vaultKey: 'k',
        }),
      ).rejects.toThrow(PasskeyControllerErrorMessage.NoRegistrationCeremony);
    });

    it('throws when passkey is already enrolled', async () => {
      setupRegistrationMocks();
      const regOpts = createController().generateRegistrationOptions();
      const controller = createController({
        state: {
          passkeyRecord: {
            credential: {
              id: TEST_CREDENTIAL_ID,
              publicKey: TEST_PUBLIC_KEY,
              counter: 0,
              transports: ['internal'],
              aaguid: '00000000-0000-0000-0000-000000000000',
            },
            encryptedVaultKey: { ciphertext: 'YQ', iv: 'Yg' },
            keyDerivation: { method: 'userHandle' },
          },
        },
      });
      await expect(
        controller.protectVaultKeyWithPasskey({
          registrationResponse: minimalRegistrationResponse(
            undefined,
            regOpts.challenge,
          ),
          authenticationResponse: minimalAuthenticationResponse(
            regOpts.user.id,
            undefined,
            TEST_CHALLENGE,
          ),
          vaultKey: 'k',
        }),
      ).rejects.toMatchObject({
        code: PasskeyControllerErrorCode.AlreadyEnrolled,
      });
    });

    it('throws when verification fails', async () => {
      mockVerifyRegistrationResponse.mockResolvedValue({
        verified: false,
      });

      const controller = createController();
      const regOpts = controller.generateRegistrationOptions();
      const regResp = minimalRegistrationResponse(undefined, regOpts.challenge);
      const authOpts = controller.generatePostRegistrationAuthenticationOptions(
        {
          registrationResponse: regResp,
        },
      );
      const authResp = minimalAuthenticationResponse(
        regOpts.user.id,
        undefined,
        authOpts.challenge,
      );

      await expect(
        controller.protectVaultKeyWithPasskey({
          registrationResponse: regResp,
          authenticationResponse: authResp,
          vaultKey: 'k',
        }),
      ).rejects.toThrow(
        PasskeyControllerErrorMessage.RegistrationVerificationFailed,
      );
    });

    it('wraps non-Error verifyRegistrationResponse rejection in RegistrationVerificationFailed', async () => {
      mockVerifyRegistrationResponse.mockRejectedValue('verify-string-error');

      const controller = createController();
      const regOpts = controller.generateRegistrationOptions();
      const regResp = minimalRegistrationResponse(undefined, regOpts.challenge);
      const authOpts = controller.generatePostRegistrationAuthenticationOptions(
        {
          registrationResponse: regResp,
        },
      );
      const authResp = minimalAuthenticationResponse(
        regOpts.user.id,
        undefined,
        authOpts.challenge,
      );

      await expect(
        controller.protectVaultKeyWithPasskey({
          registrationResponse: regResp,
          authenticationResponse: authResp,
          vaultKey: 'k',
        }),
      ).rejects.toMatchObject({
        code: PasskeyControllerErrorCode.RegistrationVerificationFailed,
        cause: expect.objectContaining({ message: 'verify-string-error' }),
      });
    });

    it('wraps verifyRegistrationResponse rejection in RegistrationVerificationFailed and clears ceremony state', async () => {
      mockVerifyRegistrationResponse.mockRejectedValue(
        new Error('verify-error'),
      );

      const controller = createController();
      const regOpts = controller.generateRegistrationOptions();
      const regResp = minimalRegistrationResponse(undefined, regOpts.challenge);
      const authOpts = controller.generatePostRegistrationAuthenticationOptions(
        {
          registrationResponse: regResp,
        },
      );
      const authResp = minimalAuthenticationResponse(
        regOpts.user.id,
        undefined,
        authOpts.challenge,
      );

      await expect(
        controller.protectVaultKeyWithPasskey({
          registrationResponse: regResp,
          authenticationResponse: authResp,
          vaultKey: 'k',
        }),
      ).rejects.toMatchObject({
        code: PasskeyControllerErrorCode.RegistrationVerificationFailed,
        message: PasskeyControllerErrorMessage.RegistrationVerificationFailed,
        cause: expect.objectContaining({ message: 'verify-error' }),
      });

      await expect(
        controller.protectVaultKeyWithPasskey({
          registrationResponse: regResp,
          authenticationResponse: minimalAuthenticationResponse(
            regOpts.user.id,
          ),
          vaultKey: 'k',
        }),
      ).rejects.toThrow(PasskeyControllerErrorMessage.NoRegistrationCeremony);
    });

    it('stores passkey record with publicKey after successful verification', async () => {
      setupRegistrationMocks();
      setupAuthenticationMocks();
      const controller = createController();
      const regOpts = controller.generateRegistrationOptions();

      await enrollWithPostRegistrationAuth(controller, {
        registrationResponse: minimalRegistrationResponse(
          undefined,
          regOpts.challenge,
        ),
        vaultKey: 'test-vault-key',
        userHandle: regOpts.user.id,
      });

      expect(controller.isPasskeyEnrolled()).toBe(true);
      const record = controller.state.passkeyRecord;
      expect(record?.credential.id).toBe(TEST_CREDENTIAL_ID);
      expect(record?.credential.publicKey).toBe(TEST_PUBLIC_KEY);
      expect(record?.credential.transports).toStrictEqual(['internal']);
      expect(record?.credential.aaguid).toBe(
        '00000000-0000-0000-0000-000000000000',
      );
      expect(record?.keyDerivation.method).toBe('userHandle');
    });

    it('throws when post-registration assertion userHandle does not match the registration ceremony', async () => {
      setupRegistrationMocks();
      setupAuthenticationMocks();
      const controller = createController();
      const regOpts = controller.generateRegistrationOptions();
      const regResp = minimalRegistrationResponse(undefined, regOpts.challenge);
      const authOpts = controller.generatePostRegistrationAuthenticationOptions(
        {
          registrationResponse: regResp,
        },
      );
      const wrongUserHandle = bytesToBase64URL(new Uint8Array(64).fill(0xbb));

      await expect(
        controller.protectVaultKeyWithPasskey({
          registrationResponse: regResp,
          authenticationResponse: minimalAuthenticationResponse(
            wrongUserHandle,
            undefined,
            authOpts.challenge,
          ),
          vaultKey: 'k',
        }),
      ).rejects.toMatchObject({
        code: PasskeyControllerErrorCode.AuthenticationVerificationFailed,
      });

      expect(controller.isPasskeyEnrolled()).toBe(false);
    });

    it('throws when userHandle derivation is required but assertion omits userHandle', async () => {
      setupRegistrationMocks();
      setupAuthenticationMocks();
      const controller = createController();
      const regOpts = controller.generateRegistrationOptions({
        prfAvailable: false,
      });
      const regResp = minimalRegistrationResponse(undefined, regOpts.challenge);
      const authOpts = controller.generatePostRegistrationAuthenticationOptions(
        {
          registrationResponse: regResp,
        },
      );
      const authResp = minimalAuthenticationResponse(
        undefined,
        undefined,
        authOpts.challenge,
      );

      await expect(
        controller.protectVaultKeyWithPasskey({
          registrationResponse: regResp,
          authenticationResponse: authResp,
          vaultKey: 'k',
        }),
      ).rejects.toMatchObject({
        code: PasskeyControllerErrorCode.AuthenticationVerificationFailed,
      });
    });

    it('uses prf derivation when extension results include PRF output', async () => {
      setupRegistrationMocks();
      setupAuthenticationMocks();
      const controller = createController();
      const regOpts = controller.generateRegistrationOptions();

      const prfFirst = bytesToBase64URL(new Uint8Array(32).fill(9));
      await enrollWithPostRegistrationAuth(controller, {
        registrationResponse: minimalRegistrationResponse(
          {
            clientExtensionResults: prfResults(prfFirst, true),
          },
          regOpts.challenge,
        ),
        vaultKey: 'vault-key-prf-path',
        authClientExtensionResults: prfResults(prfFirst, true),
      });

      expect(controller.state.passkeyRecord?.keyDerivation.method).toBe('prf');
      expect(controller.state.passkeyRecord?.keyDerivation).toMatchObject({
        method: 'prf',
        prfSalt: expect.any(String),
      });
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
      await enrollWithPostRegistrationAuth(controller, {
        registrationResponse: minimalRegistrationResponse(
          {
            clientExtensionResults: {
              prf: { enabled: true },
            } as ExtOutputsWithPrf,
          },
          regOptions.challenge,
        ),
        vaultKey,
        userHandle,
      });

      expect(controller.state.passkeyRecord?.keyDerivation).toStrictEqual({
        method: 'userHandle',
      });

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
      ).rejects.toThrow(PasskeyControllerErrorMessage.NotEnrolled);
    });

    it('throws when there is no authentication ceremony', async () => {
      setupRegistrationMocks();
      setupAuthenticationMocks();
      const controller = createController();
      const regOpts = controller.generateRegistrationOptions();
      await enrollWithPostRegistrationAuth(controller, {
        registrationResponse: minimalRegistrationResponse(
          undefined,
          regOpts.challenge,
        ),
        vaultKey: 'k',
        userHandle: regOpts.user.id,
      });

      await expect(
        controller.retrieveVaultKeyWithPasskey(
          minimalAuthenticationResponse('uh'),
        ),
      ).rejects.toThrow(PasskeyControllerErrorMessage.NoAuthenticationCeremony);
    });

    it('throws when verification fails', async () => {
      setupRegistrationMocks();
      setupAuthenticationMocks();
      const controller = createController();
      const regOpts = controller.generateRegistrationOptions();
      await enrollWithPostRegistrationAuth(controller, {
        registrationResponse: minimalRegistrationResponse(
          undefined,
          regOpts.challenge,
        ),
        vaultKey: 'k',
        userHandle: regOpts.user.id,
      });

      mockVerifyAuthenticationResponse.mockResolvedValue({
        verified: false,
      });

      const authOpts = controller.generateAuthenticationOptions();

      await expect(
        controller.retrieveVaultKeyWithPasskey(
          minimalAuthenticationResponse('uh', undefined, authOpts.challenge),
        ),
      ).rejects.toThrow(
        PasskeyControllerErrorMessage.AuthenticationVerificationFailed,
      );
    });

    it('wraps non-Error verifyAuthenticationResponse rejection in AuthenticationVerificationFailed', async () => {
      setupRegistrationMocks();
      setupAuthenticationMocks();
      const controller = createController();
      const regOpts = controller.generateRegistrationOptions();
      await enrollWithPostRegistrationAuth(controller, {
        registrationResponse: minimalRegistrationResponse(
          undefined,
          regOpts.challenge,
        ),
        vaultKey: 'k',
        userHandle: regOpts.user.id,
      });

      mockVerifyAuthenticationResponse.mockRejectedValue('auth-string-error');

      const authOpts = controller.generateAuthenticationOptions();

      await expect(
        controller.retrieveVaultKeyWithPasskey(
          minimalAuthenticationResponse('uh', undefined, authOpts.challenge),
        ),
      ).rejects.toMatchObject({
        code: PasskeyControllerErrorCode.AuthenticationVerificationFailed,
        cause: expect.objectContaining({ message: 'auth-string-error' }),
      });
    });

    it('wraps verifyAuthenticationResponse rejection in AuthenticationVerificationFailed', async () => {
      setupRegistrationMocks();
      setupAuthenticationMocks();
      const controller = createController();
      const regOpts = controller.generateRegistrationOptions();
      await enrollWithPostRegistrationAuth(controller, {
        registrationResponse: minimalRegistrationResponse(
          undefined,
          regOpts.challenge,
        ),
        vaultKey: 'k',
        userHandle: regOpts.user.id,
      });

      mockVerifyAuthenticationResponse.mockRejectedValue(
        new Error('auth-verify-error'),
      );

      const authOpts = controller.generateAuthenticationOptions();

      await expect(
        controller.retrieveVaultKeyWithPasskey(
          minimalAuthenticationResponse('uh', undefined, authOpts.challenge),
        ),
      ).rejects.toMatchObject({
        code: PasskeyControllerErrorCode.AuthenticationVerificationFailed,
        message: PasskeyControllerErrorMessage.AuthenticationVerificationFailed,
        cause: expect.objectContaining({ message: 'auth-verify-error' }),
      });
    });

    it('wraps non-Error decrypt failure in VaultKeyDecryptionFailed when retrieving vault key', async () => {
      setupRegistrationMocks();
      setupAuthenticationMocks();

      const controller = createController();
      const prfFirst = bytesToBase64URL(new Uint8Array(32).fill(42));

      const regOpts = controller.generateRegistrationOptions();
      await enrollWithPostRegistrationAuth(controller, {
        registrationResponse: minimalRegistrationResponse(
          {
            clientExtensionResults: prfResults(prfFirst),
          },
          regOpts.challenge,
        ),
        vaultKey: 'secret',
        authClientExtensionResults: prfResults(prfFirst),
      });

      const decryptSpy = jest
        .spyOn(passkeyCrypto, 'decryptWithKey')
        .mockImplementation(() => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error -- exercise non-Error rejection normalization
          throw 'decrypt-string-fail';
        });

      const authOpts = controller.generateAuthenticationOptions();
      await expect(
        controller.retrieveVaultKeyWithPasskey(
          minimalAuthenticationResponse(
            undefined,
            {
              clientExtensionResults: prfResults(prfFirst),
            },
            authOpts.challenge,
          ),
        ),
      ).rejects.toMatchObject({
        code: PasskeyControllerErrorCode.VaultKeyDecryptionFailed,
        cause: expect.objectContaining({
          message: 'decrypt-string-fail',
        }),
      });

      decryptSpy.mockRestore();
    });

    it('throws when passkey record disappears while persisting counter after auth', async () => {
      setupRegistrationMocks();
      setupAuthenticationMocks();

      const controller = createController();
      const prfFirst = bytesToBase64URL(new Uint8Array(32).fill(42));

      const regOpts = controller.generateRegistrationOptions();
      await enrollWithPostRegistrationAuth(controller, {
        registrationResponse: minimalRegistrationResponse(
          {
            clientExtensionResults: prfResults(prfFirst),
          },
          regOpts.challenge,
        ),
        vaultKey: 'secret',
        authClientExtensionResults: prfResults(prfFirst),
      });

      const updateSpy = jest.spyOn(controller, 'update' as never);
      (updateSpy as unknown as jest.Mock).mockImplementation(
        (updater: (state: PasskeyControllerState) => void) => {
          updater({
            ...getDefaultPasskeyControllerState(),
            passkeyRecord: null,
          } as PasskeyControllerState);
        },
      );

      const authOpts = controller.generateAuthenticationOptions();
      await expect(
        controller.retrieveVaultKeyWithPasskey(
          minimalAuthenticationResponse(
            undefined,
            {
              clientExtensionResults: prfResults(prfFirst),
            },
            authOpts.challenge,
          ),
        ),
      ).rejects.toThrow(PasskeyControllerError);

      updateSpy.mockRestore();
    });

    it('clears the authentication ceremony after successful retrieval (prf)', async () => {
      setupRegistrationMocks();
      setupAuthenticationMocks();

      const controller = createController();
      const prfFirst = bytesToBase64URL(new Uint8Array(32).fill(99));

      const regOpts = controller.generateRegistrationOptions();
      await enrollWithPostRegistrationAuth(controller, {
        registrationResponse: minimalRegistrationResponse(
          {
            clientExtensionResults: prfResults(prfFirst),
          },
          regOpts.challenge,
        ),
        vaultKey: 'secret',
        authClientExtensionResults: prfResults(prfFirst),
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
      ).rejects.toThrow(PasskeyControllerErrorMessage.NoAuthenticationCeremony);
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
      setupAuthenticationMocks();
      const controller = createController();
      const regOpts = controller.generateRegistrationOptions();
      await enrollWithPostRegistrationAuth(controller, {
        registrationResponse: minimalRegistrationResponse(
          undefined,
          regOpts.challenge,
        ),
        vaultKey: 'k',
        userHandle: regOpts.user.id,
      });

      expect(
        await controller.verifyPasskeyAuthentication(
          minimalAuthenticationResponse('uh'),
        ),
      ).toBe(false);
    });

    it('returns false when verification fails', async () => {
      setupRegistrationMocks();
      setupAuthenticationMocks();
      const controller = createController();
      const regOpts = controller.generateRegistrationOptions();
      await enrollWithPostRegistrationAuth(controller, {
        registrationResponse: minimalRegistrationResponse(
          undefined,
          regOpts.challenge,
        ),
        vaultKey: 'k',
        userHandle: regOpts.user.id,
      });

      mockVerifyAuthenticationResponse.mockResolvedValue({
        verified: false,
      });

      const authOpts = controller.generateAuthenticationOptions();

      expect(
        await controller.verifyPasskeyAuthentication(
          minimalAuthenticationResponse('uh', undefined, authOpts.challenge),
        ),
      ).toBe(false);
    });

    it('rethrows non-operational errors (e.g. malformed clientDataJSON)', async () => {
      setupRegistrationMocks();
      setupAuthenticationMocks();
      const controller = createController();
      const regOpts = controller.generateRegistrationOptions();
      await enrollWithPostRegistrationAuth(controller, {
        registrationResponse: minimalRegistrationResponse(
          undefined,
          regOpts.challenge,
        ),
        vaultKey: 'k',
        userHandle: regOpts.user.id,
      });
      controller.generateAuthenticationOptions();

      const badClientData = bytesToBase64URL(
        new TextEncoder().encode('not-json'),
      );
      await expect(
        controller.verifyPasskeyAuthentication(
          minimalAuthenticationResponse('uh', {
            response: {
              ...minimalAuthenticationResponse('uh').response,
              clientDataJSON: badClientData,
            },
          }),
        ),
      ).rejects.toThrow(SyntaxError);
    });

    it('returns true on successful authentication (prf)', async () => {
      setupRegistrationMocks();
      setupAuthenticationMocks();

      const controller = createController();
      const prfFirst = bytesToBase64URL(new Uint8Array(32).fill(7));
      const vaultKey = 'verify-bool-ok';

      const regOpts = controller.generateRegistrationOptions();
      await enrollWithPostRegistrationAuth(controller, {
        registrationResponse: minimalRegistrationResponse(
          {
            clientExtensionResults: prfResults(prfFirst),
          },
          regOpts.challenge,
        ),
        vaultKey,
        authClientExtensionResults: prfResults(prfFirst),
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

      await enrollWithPostRegistrationAuth(controller, {
        registrationResponse: minimalRegistrationResponse(
          undefined,
          regOpts.challenge,
        ),
        vaultKey,
        userHandle: regOpts.user.id,
      });

      expect(controller.state.passkeyRecord?.keyDerivation.method).toBe(
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
      ).rejects.toThrow(PasskeyControllerErrorMessage.VaultKeyDecryptionFailed);

      authOpts = controller.generateAuthenticationOptions();
      await expect(
        controller.retrieveVaultKeyWithPasskey(
          minimalAuthenticationResponse(
            undefined,
            undefined,
            authOpts.challenge,
          ),
        ),
      ).rejects.toThrow(PasskeyControllerErrorMessage.MissingKeyMaterial);
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
      await enrollWithPostRegistrationAuth(controller, {
        registrationResponse: minimalRegistrationResponse(
          {
            clientExtensionResults: prfResults(prfFirst),
          },
          regOpts.challenge,
        ),
        vaultKey,
        authClientExtensionResults: prfResults(prfFirst),
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
      ).rejects.toThrow(PasskeyControllerErrorMessage.NotEnrolled);
    });

    it('updates the passkey wrap when before/after vault keys match', async () => {
      setupRegistrationMocks();
      setupAuthenticationMocks();

      const controller = createController();
      const prfFirst = bytesToBase64URL(new Uint8Array(32).fill(42));
      const beforeKey = 'vault-key-before-password';

      const regOpts = controller.generateRegistrationOptions();
      await enrollWithPostRegistrationAuth(controller, {
        registrationResponse: minimalRegistrationResponse(
          {
            clientExtensionResults: prfResults(prfFirst),
          },
          regOpts.challenge,
        ),
        vaultKey: beforeKey,
        authClientExtensionResults: prfResults(prfFirst),
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
      await enrollWithPostRegistrationAuth(controller, {
        registrationResponse: minimalRegistrationResponse(
          {
            clientExtensionResults: prfResults(prfFirst),
          },
          regOpts.challenge,
        ),
        vaultKey: 'actual-wrapped-key',
        authClientExtensionResults: prfResults(prfFirst),
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
      ).rejects.toThrow(PasskeyControllerErrorMessage.VaultKeyMismatch);
    });

    it('throws when decrypting the wrapped vault key fails during renewal', async () => {
      setupRegistrationMocks();
      setupAuthenticationMocks();

      const controller = createController();
      const prfFirst = bytesToBase64URL(new Uint8Array(32).fill(42));

      const regOpts = controller.generateRegistrationOptions();
      await enrollWithPostRegistrationAuth(controller, {
        registrationResponse: minimalRegistrationResponse(
          {
            clientExtensionResults: prfResults(prfFirst),
          },
          regOpts.challenge,
        ),
        vaultKey: 'wrapped-key',
        authClientExtensionResults: prfResults(prfFirst),
      });

      const decryptSpy = jest
        .spyOn(passkeyCrypto, 'decryptWithKey')
        .mockImplementation(() => {
          throw new Error('decrypt failed');
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
          oldVaultKey: 'wrapped-key',
          newVaultKey: 'new-key',
        }),
      ).rejects.toMatchObject({
        code: PasskeyControllerErrorCode.VaultKeyDecryptionFailed,
      });

      decryptSpy.mockRestore();
    });

    it('wraps non-Error decrypt failure in VaultKeyDecryptionFailed during renewal', async () => {
      setupRegistrationMocks();
      setupAuthenticationMocks();

      const controller = createController();
      const prfFirst = bytesToBase64URL(new Uint8Array(32).fill(42));

      const regOpts = controller.generateRegistrationOptions();
      await enrollWithPostRegistrationAuth(controller, {
        registrationResponse: minimalRegistrationResponse(
          {
            clientExtensionResults: prfResults(prfFirst),
          },
          regOpts.challenge,
        ),
        vaultKey: 'wrapped-key',
        authClientExtensionResults: prfResults(prfFirst),
      });

      const decryptSpy = jest
        .spyOn(passkeyCrypto, 'decryptWithKey')
        .mockImplementation(() => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error -- exercise non-Error rejection normalization
          throw 'renew-decrypt-fail';
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
          oldVaultKey: 'wrapped-key',
          newVaultKey: 'new-key',
        }),
      ).rejects.toMatchObject({
        code: PasskeyControllerErrorCode.VaultKeyDecryptionFailed,
        cause: expect.objectContaining({ message: 'renew-decrypt-fail' }),
      });

      decryptSpy.mockRestore();
    });

    it('throws when passkey record disappears while persisting renewed ciphertext', async () => {
      setupRegistrationMocks();
      setupAuthenticationMocks();

      const controller = createController();
      const prfFirst = bytesToBase64URL(new Uint8Array(32).fill(42));

      const regOpts = controller.generateRegistrationOptions();
      await enrollWithPostRegistrationAuth(controller, {
        registrationResponse: minimalRegistrationResponse(
          {
            clientExtensionResults: prfResults(prfFirst),
          },
          regOpts.challenge,
        ),
        vaultKey: 'wrapped',
        authClientExtensionResults: prfResults(prfFirst),
      });

      const updateSpy = jest.spyOn(controller, 'update' as never);
      (updateSpy as unknown as jest.Mock).mockImplementation(
        (updater: (state: PasskeyControllerState) => void) => {
          updater({
            ...getDefaultPasskeyControllerState(),
            passkeyRecord: null,
          } as PasskeyControllerState);
        },
      );

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
          newVaultKey: 'next',
        }),
      ).rejects.toThrow(PasskeyControllerError);

      updateSpy.mockRestore();
    });

    it('completes renewal without an active authentication ceremony (prf)', async () => {
      setupRegistrationMocks();
      setupAuthenticationMocks();

      const controller = createController();
      const prfFirst = bytesToBase64URL(new Uint8Array(32).fill(42));

      const regOpts = controller.generateRegistrationOptions();
      await enrollWithPostRegistrationAuth(controller, {
        registrationResponse: minimalRegistrationResponse(
          {
            clientExtensionResults: prfResults(prfFirst),
          },
          regOpts.challenge,
        ),
        vaultKey: 'wrapped',
        authClientExtensionResults: prfResults(prfFirst),
      });

      await controller.renewVaultKeyProtection({
        authenticationResponse: minimalAuthenticationResponse(
          undefined,
          {
            clientExtensionResults: prfResults(prfFirst),
          },
          TEST_CHALLENGE,
        ),
        oldVaultKey: 'wrapped',
        newVaultKey: 'new',
      });

      const authOpts = controller.generateAuthenticationOptions();
      const unwrapped = await controller.retrieveVaultKeyWithPasskey(
        minimalAuthenticationResponse(
          undefined,
          {
            clientExtensionResults: prfResults(prfFirst),
          },
          authOpts.challenge,
        ),
      );
      expect(unwrapped).toBe('new');
    });

    it('does not invoke verifyAuthenticationResponse', async () => {
      setupRegistrationMocks();
      setupAuthenticationMocks();

      const controller = createController();
      const prfFirst = bytesToBase64URL(new Uint8Array(32).fill(42));

      const regOpts = controller.generateRegistrationOptions();
      await enrollWithPostRegistrationAuth(controller, {
        registrationResponse: minimalRegistrationResponse(
          {
            clientExtensionResults: prfResults(prfFirst),
          },
          regOpts.challenge,
        ),
        vaultKey: 'wrapped',
        authClientExtensionResults: prfResults(prfFirst),
      });

      mockVerifyAuthenticationResponse.mockClear();

      const authOpts = controller.generateAuthenticationOptions();
      await controller.renewVaultKeyProtection({
        authenticationResponse: minimalAuthenticationResponse(
          undefined,
          {
            clientExtensionResults: prfResults(prfFirst),
          },
          authOpts.challenge,
        ),
        oldVaultKey: 'wrapped',
        newVaultKey: 'rotated',
      });

      expect(mockVerifyAuthenticationResponse).not.toHaveBeenCalled();
    });
  });

  describe('removePasskey', () => {
    it('clears in-flight registration ceremonies', async () => {
      setupRegistrationMocks();
      const controller = createController();
      const regOpts = controller.generateRegistrationOptions();
      controller.removePasskey();

      await expect(
        controller.protectVaultKeyWithPasskey({
          registrationResponse: minimalRegistrationResponse(
            undefined,
            regOpts.challenge,
          ),
          authenticationResponse: minimalAuthenticationResponse(
            regOpts.user.id,
          ),
          vaultKey: 'k',
        }),
      ).rejects.toThrow(PasskeyControllerErrorMessage.NoRegistrationCeremony);
    });

    it('clears stored record and resets enrollment', async () => {
      setupRegistrationMocks();
      setupAuthenticationMocks();
      const controller = createController();
      const regOpts = controller.generateRegistrationOptions();
      await enrollWithPostRegistrationAuth(controller, {
        registrationResponse: minimalRegistrationResponse(
          undefined,
          regOpts.challenge,
        ),
        vaultKey: 'k',
        userHandle: regOpts.user.id,
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
      setupAuthenticationMocks();
      const controller = createController();
      const regOpts = controller.generateRegistrationOptions();
      await enrollWithPostRegistrationAuth(controller, {
        registrationResponse: minimalRegistrationResponse(
          undefined,
          regOpts.challenge,
        ),
        vaultKey: 'k',
        userHandle: regOpts.user.id,
      });
      expect(controller.isPasskeyEnrolled()).toBe(true);

      controller.clearState();
      expect(controller.isPasskeyEnrolled()).toBe(false);
      expect(controller.state.passkeyRecord).toBeNull();
    });
  });

  describe('destroy', () => {
    it('clears in-flight ceremony state', async () => {
      setupRegistrationMocks();
      const controller = createController();
      const regOpts = controller.generateRegistrationOptions();

      controller.destroy();

      await expect(
        controller.protectVaultKeyWithPasskey({
          registrationResponse: minimalRegistrationResponse(
            undefined,
            regOpts.challenge,
          ),
          authenticationResponse: minimalAuthenticationResponse(
            regOpts.user.id,
          ),
          vaultKey: 'k',
        }),
      ).rejects.toThrow(PasskeyControllerErrorMessage.NoRegistrationCeremony);
    });
  });

  describe('passkeyControllerSelectors', () => {
    describe('selectIsPasskeyEnrolled', () => {
      it('returns false when no record is stored', () => {
        expect(
          passkeyControllerSelectors.selectIsPasskeyEnrolled({
            passkeyRecord: null,
          }),
        ).toBe(false);
      });

      it('returns true when a record is stored', () => {
        const record: PasskeyRecord = {
          credential: {
            id: TEST_CREDENTIAL_ID,
            publicKey: TEST_PUBLIC_KEY,
            counter: 0,
            transports: ['internal'],
            aaguid: '00000000-0000-0000-0000-000000000000',
          },
          encryptedVaultKey: { ciphertext: 'YQ==', iv: 'YWFhYWFhYWFhYQ==' },
          keyDerivation: { method: 'userHandle' },
        };
        expect(
          passkeyControllerSelectors.selectIsPasskeyEnrolled({
            passkeyRecord: record,
          }),
        ).toBe(true);
      });
    });
  });

  describe('verifyRegistrationResponse parameters', () => {
    it('passes expectedOrigin and expectedRPID to verification', async () => {
      setupRegistrationMocks();
      setupAuthenticationMocks();
      const controller = createController({
        expectedRPID: 'custom-rp.com',
        expectedOrigin: 'chrome-extension://abc123',
        rpId: undefined,
      });

      const regOpts = controller.generateRegistrationOptions();
      await enrollWithPostRegistrationAuth(controller, {
        registrationResponse: minimalRegistrationResponse(
          undefined,
          regOpts.challenge,
        ),
        vaultKey: 'k',
        userHandle: regOpts.user.id,
      });

      expect(mockVerifyRegistrationResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          expectedOrigin: 'chrome-extension://abc123',
          expectedRPIDs: ['custom-rp.com'],
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
      await enrollWithPostRegistrationAuth(controller, {
        registrationResponse: minimalRegistrationResponse(
          {
            clientExtensionResults: prfResults(prfFirst),
          },
          regOpts.challenge,
        ),
        vaultKey: 'k',
        authClientExtensionResults: prfResults(prfFirst),
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
          expectedRPIDs: [TEST_RP_ID],
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
      setupAuthenticationMocks();
      const controller = createController();
      const prfFirst = bytesToBase64URL(new Uint8Array(32).fill(42));

      const regOpts = controller.generateRegistrationOptions();
      await enrollWithPostRegistrationAuth(controller, {
        registrationResponse: minimalRegistrationResponse(
          {
            clientExtensionResults: prfResults(prfFirst),
          },
          regOpts.challenge,
        ),
        vaultKey: 'k',
        authClientExtensionResults: prfResults(prfFirst),
      });

      expect(controller.state.passkeyRecord?.credential.counter).toBe(0);

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

      expect(controller.state.passkeyRecord?.credential.counter).toBe(5);

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
      expect(controller.state.passkeyRecord?.credential.counter).toBe(10);
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
      await enrollWithPostRegistrationAuth(controller, {
        registrationResponse: minimalRegistrationResponse(
          {
            clientExtensionResults: prfResults(prfFirst),
          },
          regOpts.challenge,
        ),
        vaultKey,
        authClientExtensionResults: prfResults(prfFirst),
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

    it('does not overwrite passkey fields updated while authentication verification awaits', async () => {
      setupRegistrationMocks();
      setupAuthenticationMocks();
      const controller = createController();
      const prfFirst = bytesToBase64URL(new Uint8Array(32).fill(99));
      const vaultKey = 'vault-concurrent-field';

      const regOpts = controller.generateRegistrationOptions();
      await enrollWithPostRegistrationAuth(controller, {
        registrationResponse: minimalRegistrationResponse(
          {
            clientExtensionResults: prfResults(prfFirst),
          },
          regOpts.challenge,
        ),
        vaultKey,
        authClientExtensionResults: prfResults(prfFirst),
      });

      let finishVerify!: (value: unknown) => void;
      mockVerifyAuthenticationResponse.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishVerify = resolve;
          }),
      );

      const authOpts = controller.generateAuthenticationOptions();
      const retrievePromise = controller.retrieveVaultKeyWithPasskey(
        minimalAuthenticationResponse(
          undefined,
          {
            clientExtensionResults: prfResults(prfFirst),
          },
          authOpts.challenge,
        ),
      );

      await Promise.resolve();

      const concurrentTransports = ['hybrid', 'internal'] as const;
      expect(
        controller.state.passkeyRecord?.credential.transports,
      ).toStrictEqual(['internal']);

      (
        controller as unknown as {
          update: (callback: (state: PasskeyControllerState) => void) => void;
        }
      ).update((state) => {
        if (!state.passkeyRecord) {
          return;
        }
        state.passkeyRecord.credential.transports = [...concurrentTransports];
      });

      finishVerify({
        verified: true,
        authenticationInfo: {
          credentialId: TEST_CREDENTIAL_ID,
          newCounter: 3,
          userVerified: true,
          origin: TEST_ORIGIN,
          rpID: TEST_RP_ID,
        },
      });

      await retrievePromise;

      expect(
        controller.state.passkeyRecord?.credential.transports,
      ).toStrictEqual([...concurrentTransports]);
      expect(controller.state.passkeyRecord?.credential.counter).toBe(3);
    });

    it('completes registration using the first challenge after a second generateRegistrationOptions', async () => {
      setupRegistrationMocks();
      setupAuthenticationMocks();
      const controller = createController();
      const vaultKey = 'multi-reg-ceremony';

      const regOpts1 = controller.generateRegistrationOptions();
      controller.generateRegistrationOptions();

      await enrollWithPostRegistrationAuth(controller, {
        registrationResponse: minimalRegistrationResponse(
          undefined,
          regOpts1.challenge,
        ),
        vaultKey,
        userHandle: regOpts1.user.id,
      });

      expect(controller.isPasskeyEnrolled()).toBe(true);
      expect(controller.state.passkeyRecord).not.toBeNull();
    });
  });

  describe('ceremony TTL', () => {
    it('drops expired registration ceremonies before protectVaultKeyWithPasskey', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(1_000_000);
      setupRegistrationMocks();
      const controller = createController();
      const regOpts = controller.generateRegistrationOptions();

      jest.setSystemTime(1_000_000 + CEREMONY_MAX_AGE_MS + 1);

      await expect(
        controller.protectVaultKeyWithPasskey({
          registrationResponse: minimalRegistrationResponse(
            undefined,
            regOpts.challenge,
          ),
          authenticationResponse: minimalAuthenticationResponse(
            regOpts.user.id,
          ),
          vaultKey: 'k',
        }),
      ).rejects.toThrow(PasskeyControllerErrorMessage.NoRegistrationCeremony);

      jest.useRealTimers();
    });

    it('removes authentication ceremony entry when verification fails', async () => {
      setupRegistrationMocks();
      setupAuthenticationMocks();
      const controller = createController();
      const regOpts = controller.generateRegistrationOptions();
      const userHandle = regOpts.user.id;
      await enrollWithPostRegistrationAuth(controller, {
        registrationResponse: minimalRegistrationResponse(
          undefined,
          regOpts.challenge,
        ),
        vaultKey: 'k',
        userHandle,
      });

      mockVerifyAuthenticationResponse.mockResolvedValue({
        verified: false,
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
      ).rejects.toThrow(
        PasskeyControllerErrorMessage.AuthenticationVerificationFailed,
      );

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
