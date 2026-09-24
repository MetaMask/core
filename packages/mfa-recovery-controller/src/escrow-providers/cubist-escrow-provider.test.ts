import type { CubeSignerClient } from '@cubist-labs/cubesigner-sdk';

import {
  generateSigningKey,
  hashMutationReceipt,
  sign,
  wrapKeyId,
} from '../crypto.js';
import { MfaRecoveryError } from '../errors.js';
import type {
  AuthControllerToken,
  EcPublicJwk,
  IdentifierAuthorization,
  Mutation,
  MutationPayload,
  MutationReceipt,
} from '../types.js';
import { CubistEscrowProvider } from './cubist-escrow-provider.js';

const wrapKey = generateSigningKey();
const receiptKey = generateSigningKey();

const MUTATION: Mutation = {
  id: 'mut-1',
  profileId: 'profile-1',
  operation: 'register',
  expectedVersion: 0,
  newVersion: 1,
  payloadHash: '0xabc',
  audiences: ['cubist'],
  requestHash: '0xdef',
};

const TOKEN: AuthControllerToken = {
  profileId: 'profile-1',
  requestHash: '0xdef',
  issuer: 'auth',
  expiresAt: 1_800_000_000,
  signature: '00',
};

const PAYLOAD: MutationPayload = {
  identifiers: [],
  recoverySecret: {
    pkE: { kty: 'EC', crv: 'P-256', x: 'eA', y: 'eB' },
    ciphertext: 'aa',
  },
};

const AUTHORIZATION: IdentifierAuthorization = {
  kind: 'key-bound',
  token: {
    identifier: {
      type: 'passkey',
      namespace: 'example.com',
      value: 'cred-1',
      verifier: { publicKey: 'pk' },
    },
    proofPublicKey: '{}',
    requestHash: '0x1',
    providerAssertion: {},
  },
  proof: {
    challengeId: 'challenge-1',
    requestHash: '0x1',
    signature: '11',
  },
};

const PK_E: EcPublicJwk = { kty: 'EC', crv: 'P-256', x: 'x', y: 'y' };

const CHALLENGE = {
  id: 'challenge-1',
  escrowId: 'cubist',
  expiresAt: 1_800_000_300,
};

describe('CubistEscrowProvider', () => {
  it('uses the cubist escrow id and the pinned wrap key', () => {
    const { provider } = createProvider();
    expect(provider.id).toBe('cubist');
    expect(provider.wrapPublicKey).toBe(wrapKey.publicKey);
  });

  describe('isAvailable', () => {
    it('returns true when the C2F function can be loaded', async () => {
      const { provider, getFunction } = createProvider();
      expect(await provider.isAvailable()).toBe(true);
      expect(getFunction).toHaveBeenCalledWith('cubist_secret_escrow');
    });

    it('loads a caller-specified function id', async () => {
      const { provider, getFunction } = createProvider({
        functionId: 'NamedPolicy#escrow',
      });
      expect(await provider.isAvailable()).toBe(true);
      expect(getFunction).toHaveBeenCalledWith('NamedPolicy#escrow');
    });

    it('returns false when getFunction throws', async () => {
      const { provider } = createProvider({
        getFunction: async () => {
          throw new Error('offline');
        },
      });
      expect(await provider.isAvailable()).toBe(false);
    });
  });

  describe('generateChallenge', () => {
    it('invokes generateChallenge and returns the challenge from stdout', async () => {
      const { provider, invoke } = createProvider({
        stdout: CHALLENGE,
      });
      expect(await provider.generateChallenge()).toStrictEqual(CHALLENGE);
      expect(invoke).toHaveBeenCalledWith(undefined, 'latest', {
        cmd: 'generateChallenge',
      });
    });

    it('invokes a caller-specified function version', async () => {
      const { provider, invoke } = createProvider({ version: 'v0' });
      await provider.generateChallenge();
      expect(invoke.mock.calls[0]?.[1]).toBe('v0');
    });

    it.each([
      ['not an object', 1],
      ['null', null],
      ['missing id', { escrowId: 'cubist', expiresAt: 1 }],
      ['wrong escrow', { ...CHALLENGE, escrowId: 'other' }],
      ['non-numeric expiry', { ...CHALLENGE, expiresAt: '1' }],
      ['non-integer expiry', { ...CHALLENGE, expiresAt: 1.5 }],
    ])('rejects a challenge that is %s', async (_label, body) => {
      const { provider } = createProvider({ stdout: body });
      await expect(provider.generateChallenge()).rejects.toBeInstanceOf(
        MfaRecoveryError,
      );
      await expect(provider.generateChallenge()).rejects.toMatchObject({
        code: 'escrow_response_invalid',
      });
    });
  });

  describe('applyMutation', () => {
    it('invokes applyMutation, including a null identifier authorization', async () => {
      const receipt = signedReceipt();
      const { provider, invoke } = createProvider({ stdout: receipt });
      expect(
        await provider.applyMutation(MUTATION, TOKEN, null, PAYLOAD),
      ).toStrictEqual(receipt);
      expect(invoke).toHaveBeenCalledWith(undefined, 'latest', {
        cmd: 'applyMutation',
        mutation: MUTATION,
        authControllerToken: TOKEN,
        identifierAuthorization: null,
        payload: PAYLOAD,
      });
    });

    it('rejects a response that is not a receipt', async () => {
      const { provider } = createProvider({ stdout: { nope: true } });
      await expect(
        provider.applyMutation(MUTATION, TOKEN, AUTHORIZATION, PAYLOAD),
      ).rejects.toMatchObject({ code: 'escrow_response_invalid' });
    });
  });

  describe('getSecret', () => {
    const secretResponse = {
      recoverySecret: { ciphertext: 'cc' },
      version: 1,
      lastMutationId: 'mut-1',
      wrapKeyId: '0xabc',
    };

    it('invokes getSecret and returns the wrapped secret', async () => {
      const { provider, invoke } = createProvider({ stdout: secretResponse });
      expect(
        await provider.getSecret(AUTHORIZATION, 'req-1', PK_E),
      ).toStrictEqual(secretResponse);
      expect(invoke).toHaveBeenCalledWith(undefined, 'latest', {
        cmd: 'getSecret',
        identifierAuthorization: AUTHORIZATION,
        requestId: 'req-1',
        pkE: PK_E,
      });
    });

    it.each([
      ['not an object', 1],
      ['null', null],
      ['missing wrap object', { ...secretResponse, recoverySecret: 'x' }],
      ['missing ciphertext', { ...secretResponse, recoverySecret: {} }],
      ['non-numeric version', { ...secretResponse, version: '1' }],
      ['fractional version', { ...secretResponse, version: 1.2 }],
      ['negative version', { ...secretResponse, version: -1 }],
      ['missing mutation id', { ...secretResponse, lastMutationId: 1 }],
      ['missing wrap key id', { ...secretResponse, wrapKeyId: 1 }],
    ])('rejects a secret response that is %s', async (_label, body) => {
      const { provider } = createProvider({ stdout: body });
      await expect(
        provider.getSecret(AUTHORIZATION, 'req-1', PK_E),
      ).rejects.toMatchObject({ code: 'escrow_response_invalid' });
    });
  });

  describe('request failures', () => {
    it('throws when the policy denies the invocation', async () => {
      const { provider } = createProvider({
        policy: { response: 'Deny', reason: 'not allowed' },
      });
      await expect(provider.generateChallenge()).rejects.toMatchObject({
        code: 'escrow_request_failed',
        message: 'not allowed',
      });
    });

    it('throws when the policy engine errors', async () => {
      const { provider } = createProvider({
        policy: { response: 'Error', error: 'wasm panic' },
      });
      await expect(provider.generateChallenge()).rejects.toMatchObject({
        code: 'escrow_request_failed',
        message: 'wasm panic',
      });
    });

    it('throws when stdout is not JSON', async () => {
      const { provider } = createProvider({
        stdoutBytes: new TextEncoder().encode('nope'),
      });
      await expect(provider.generateChallenge()).rejects.toMatchObject({
        code: 'escrow_response_invalid',
      });
    });

    it('throws the invoke error message when the request fails', async () => {
      const { provider } = createProvider({
        invoke: async () => {
          throw new Error('offline');
        },
      });
      await expect(provider.generateChallenge()).rejects.toMatchObject({
        code: 'escrow_request_failed',
        message: 'offline',
      });
    });

    it('throws a generic message when invoke rejects with a non-Error', async () => {
      const { provider } = createProvider({
        invoke: async () => {
          // Cover the non-Error rejection path in `#invoke`.
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw 0;
        },
      });
      await expect(provider.generateChallenge()).rejects.toMatchObject({
        code: 'escrow_request_failed',
        message: 'Escrow request failed',
      });
    });
  });

  describe('verifyReceipt', () => {
    const { provider } = createProvider();

    it('accepts a receipt signed by the pinned receipt key', () => {
      expect(
        provider.verifyReceipt(signedReceipt(), MUTATION, 'cubist'),
      ).toBe(true);
    });

    it.each([
      ['mutation id', { mutationId: 'other' }],
      ['request hash', { requestHash: '0xother' }],
      ['escrow id', { escrowId: 'other' }],
      ['version', { version: 2 }],
      ['receipt key id', { receiptKeyId: '0xother' }],
    ] as const)('rejects a receipt with a different %s', (_label, patch) => {
      expect(
        provider.verifyReceipt(
          { ...signedReceipt(), ...patch },
          MUTATION,
          'cubist',
        ),
      ).toBe(false);
    });

    it('rejects a receipt aimed at a different escrow id', () => {
      expect(
        provider.verifyReceipt(
          { ...signedReceipt(), escrowId: 'other' },
          MUTATION,
          'other',
        ),
      ).toBe(false);
    });

    it('rejects a receipt with a bad signature', () => {
      expect(
        provider.verifyReceipt(
          { ...signedReceipt(), signature: '00' },
          MUTATION,
          'cubist',
        ),
      ).toBe(false);
    });
  });
});

function createProvider(
  options: {
    functionId?: string;
    version?: 'latest' | `v${number}`;
    stdout?: unknown;
    stdoutBytes?: Uint8Array;
    policy?:
      | { response: 'Allow' }
      | { response: 'Deny'; reason: string }
      | { response: 'Error'; error: string };
    invoke?: () => Promise<unknown>;
    getFunction?: () => Promise<{ invoke: jest.Mock }>;
  } = {},
): {
  provider: CubistEscrowProvider;
  invoke: jest.Mock;
  getFunction: jest.Mock;
} {
  const invoke =
    options.invoke === undefined
      ? jest.fn(async () => ({
          response: options.policy ?? { response: 'Allow' },
          stdoutBytes:
            options.stdoutBytes ??
            new TextEncoder().encode(
              JSON.stringify(
                Object.hasOwn(options, 'stdout') ? options.stdout : CHALLENGE,
              ),
            ),
        }))
      : jest.fn(options.invoke);
  const getFunction =
    options.getFunction === undefined
      ? jest.fn(async () => ({ invoke }))
      : jest.fn(options.getFunction);
  const client = {
    org: () => ({ getFunction }),
  } as unknown as CubeSignerClient;
  return {
    provider: new CubistEscrowProvider({
      client,
      wrapPublicKey: wrapKey.publicKey,
      receiptPublicKey: receiptKey.publicKey,
      functionId: options.functionId,
      version: options.version,
    }),
    invoke,
    getFunction,
  };
}

function signedReceipt(
  patch: Partial<MutationReceipt> = {},
): MutationReceipt {
  const unsigned = {
    mutationId: MUTATION.id,
    requestHash: MUTATION.requestHash,
    escrowId: 'cubist',
    version: MUTATION.newVersion,
    receiptKeyId: wrapKeyId(receiptKey.publicKey),
    ...patch,
  };
  return {
    ...unsigned,
    signature: sign(receiptKey.privateKey, hashMutationReceipt(unsigned)),
  };
}
