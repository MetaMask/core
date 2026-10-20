import type { CubeSignerClient } from '@cubist-labs/cubesigner-sdk';
import { bytesToHex } from '@metamask/utils';
import type { Mock } from 'vitest';
import { describe, expect, it, vi } from 'vitest';

import {
  generateSigningKey,
  generateWrapKey,
  hashMutationReceipt,
  receiptKeyId,
  sign,
} from '../crypto.js';
import { MfaRecoveryError, MutationRejectedError } from '../errors.js';
import type {
  AuthControllerToken,
  IdentifierAuthorization,
  Mutation,
  MutationPayload,
  MutationReceipt,
} from '../types.js';
import { CubistEscrowProvider } from './cubist-escrow-provider.js';

const wrapKey = await generateWrapKey();
const receiptKey = await generateSigningKey();

const PK_E = new Uint8Array(32).fill(7);
const CIPHERTEXT = new Uint8Array([0xaa, 0xbb]);

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

const TOKEN: AuthControllerToken = 'header.payload.signature';

const PAYLOAD: MutationPayload = {
  identifiers: [],
  recoverySecret: {
    pkE: PK_E,
    ciphertext: CIPHERTEXT,
  },
};

const WIRE_PAYLOAD = {
  identifiers: [],
  recoverySecret: {
    pkE: bytesToHex(PK_E),
    ciphertext: bytesToHex(CIPHERTEXT),
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
    proofPublicKey: new Uint8Array(32).fill(1),
    requestHash: '0x1',
    providerAssertion: {},
  },
  proof: {
    challengeId: 'challenge-1',
    requestHash: '0x1',
    signature: '11',
  },
};

const CHALLENGE = {
  id: 'challenge-1',
  escrowId: 'cubist',
  expiresAt: 1_800_000_300,
};

describe('CubistEscrowProvider', () => {
  it('uses the cubist escrow id and the pinned wrap key', () => {
    const { provider } = createProvider();
    expect(provider.id).toBe('cubist');
    expect(provider.wrapPublicKey).toStrictEqual(wrapKey.publicKey);
  });

  describe('isAvailable', () => {
    it('returns true when ping is allowed and reports ok', async () => {
      const { provider, invoke } = createProvider({
        stdout: { ok: true },
      });
      expect(await provider.isAvailable()).toBe(true);
      expect(invoke).toHaveBeenCalledWith('cubist_secret_escrow', 'latest', {
        request: { cmd: 'ping' },
      });
    });

    it('pings a caller-specified function id', async () => {
      const { provider, invoke } = createProvider({
        functionId: 'NamedPolicy#escrow',
        stdout: { ok: true },
      });
      expect(await provider.isAvailable()).toBe(true);
      expect(invoke).toHaveBeenCalledWith('NamedPolicy#escrow', 'latest', {
        request: { cmd: 'ping' },
      });
    });

    it('returns false when policyInvoke throws', async () => {
      const { provider } = createProvider({
        invoke: async () => {
          throw new Error('offline');
        },
      });
      expect(await provider.isAvailable()).toBe(false);
    });

    it('returns false when ping does not report ok', async () => {
      const { provider } = createProvider({ stdout: { ok: false } });
      expect(await provider.isAvailable()).toBe(false);
    });
  });

  describe('generateChallenge', () => {
    it('invokes generateChallenge and returns the challenge from stdout', async () => {
      const { provider, invoke } = createProvider({
        stdout: CHALLENGE,
      });
      expect(await provider.generateChallenge()).toStrictEqual(CHALLENGE);
      expect(invoke).toHaveBeenCalledWith('cubist_secret_escrow', 'latest', {
        request: { cmd: 'generateChallenge' },
      });
    });

    it('invokes a caller-specified function version', async () => {
      const { provider, invoke } = createProvider({ version: 'v0' });
      await provider.generateChallenge();
      expect(invoke).toHaveBeenCalledWith('cubist_secret_escrow', 'v0', {
        request: { cmd: 'generateChallenge' },
      });
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
      const receipt = await signedReceipt();
      const { provider, invoke } = createProvider({ stdout: receipt });
      expect(
        await provider.applyMutation(MUTATION, TOKEN, null, PAYLOAD),
      ).toStrictEqual(receipt);
      expect(invoke).toHaveBeenCalledWith('cubist_secret_escrow', 'latest', {
        request: {
          cmd: 'applyMutation',
          mutation: MUTATION,
          authControllerToken: TOKEN,
          identifierAuthorization: null,
          payload: WIRE_PAYLOAD,
        },
      });
    });

    it('hex-encodes byte fields in the request sent to the escrow', async () => {
      const { provider, invoke } = createProvider({
        stdout: await signedReceipt(),
      });
      await provider.applyMutation(MUTATION, TOKEN, AUTHORIZATION, PAYLOAD);
      const [, , { request }] = invoke.mock.calls[0] as [
        string,
        string,
        { request: { identifierAuthorization: { token: unknown } } },
      ];
      expect(request.identifierAuthorization.token).toStrictEqual({
        identifier: AUTHORIZATION.token.identifier,
        proofPublicKey: bytesToHex(new Uint8Array(32).fill(1)),
        requestHash: '0x1',
        providerAssertion: {},
      });
    });

    it('rejects a response that is not a receipt', async () => {
      const { provider } = createProvider({ stdout: { nope: true } });
      await expect(
        provider.applyMutation(MUTATION, TOKEN, AUTHORIZATION, PAYLOAD),
      ).rejects.toMatchObject({ code: 'escrow_response_invalid' });
    });

    it.each([
      ['fractional version', { version: 1.5 }],
      ['negative version', { version: -1 }],
      ['non-numeric version', { version: '1' }],
      ['non-string signature', { signature: 1 }],
      ['missing escrow id', { escrowId: undefined }],
    ])('rejects a receipt with a %s', async (_label, patch) => {
      const receipt = { ...(await signedReceipt()), ...patch };
      const { provider } = createProvider({ stdout: receipt });
      await expect(
        provider.applyMutation(MUTATION, TOKEN, AUTHORIZATION, PAYLOAD),
      ).rejects.toMatchObject({ code: 'escrow_response_invalid' });
    });

    it('reports a policy deny as a mutation rejection', async () => {
      const { provider } = createProvider({
        policy: { response: 'Deny', reason: 'version mismatch' },
      });
      await expect(
        provider.applyMutation(MUTATION, TOKEN, null, PAYLOAD),
      ).rejects.toBeInstanceOf(MutationRejectedError);
    });
  });

  describe('getSecret', () => {
    const secretResponse = {
      recoverySecret: { ciphertext: '0xcc' },
      version: 1,
      lastMutationId: 'mut-1',
      wrapKeyId: '0xabc',
    };

    it('invokes getSecret and returns the wrapped secret as bytes', async () => {
      const { provider, invoke } = createProvider({ stdout: secretResponse });
      expect(
        await provider.getSecret(AUTHORIZATION, 'req-1', PK_E),
      ).toStrictEqual({
        ...secretResponse,
        recoverySecret: { ciphertext: new Uint8Array([0xcc]) },
      });
      expect(invoke).toHaveBeenCalledWith('cubist_secret_escrow', 'latest', {
        request: {
          cmd: 'getSecret',
          identifierAuthorization: {
            ...AUTHORIZATION,
            token: {
              ...AUTHORIZATION.token,
              proofPublicKey: bytesToHex(AUTHORIZATION.token.proofPublicKey),
            },
          },
          requestId: 'req-1',
          pkE: bytesToHex(PK_E),
        },
      });
    });

    it.each([
      ['not an object', 1],
      ['null', null],
      ['missing wrap object', { ...secretResponse, recoverySecret: 'x' }],
      ['missing ciphertext', { ...secretResponse, recoverySecret: {} }],
      [
        'ciphertext without a 0x prefix',
        { ...secretResponse, recoverySecret: { ciphertext: 'cc' } },
      ],
      [
        'non-hex ciphertext',
        { ...secretResponse, recoverySecret: { ciphertext: '0xzz' } },
      ],
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

    it('throws when stdout is not valid hex', async () => {
      const { provider } = createProvider({
        invoke: async () => ({
          response: { response: 'Allow' },
          stdout: 'not hex',
        }),
      });
      await expect(provider.generateChallenge()).rejects.toMatchObject({
        code: 'escrow_response_invalid',
      });
    });

    it('reports the deny reason even when stdout is empty', async () => {
      const { provider } = createProvider({
        invoke: async () => ({
          response: { response: 'Deny', reason: 'not allowed' },
          stdout: '',
        }),
      });
      await expect(provider.generateChallenge()).rejects.toMatchObject({
        code: 'escrow_request_failed',
        message: 'not allowed',
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
          const nonError: unknown = 0;
          throw nonError;
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

    it('accepts a receipt signed by the pinned receipt key', async () => {
      expect(
        await provider.verifyReceipt(await signedReceipt(), MUTATION, 'cubist'),
      ).toBe(true);
    });

    it.each([
      ['mutation id', { mutationId: 'other' }],
      ['request hash', { requestHash: '0xother' }],
      ['escrow id', { escrowId: 'other' }],
      ['version', { version: 2 }],
      ['receipt key id', { receiptKeyId: '0xother' }],
    ] as const)(
      'rejects a receipt with a different %s',
      async (_label, patch) => {
        expect(
          await provider.verifyReceipt(
            { ...(await signedReceipt()), ...patch },
            MUTATION,
            'cubist',
          ),
        ).toBe(false);
      },
    );

    it('rejects a receipt aimed at a different escrow id', async () => {
      expect(
        await provider.verifyReceipt(
          { ...(await signedReceipt()), escrowId: 'other' },
          MUTATION,
          'other',
        ),
      ).toBe(false);
    });

    it('rejects a receipt with a bad signature', async () => {
      expect(
        await provider.verifyReceipt(
          { ...(await signedReceipt()), signature: '00' },
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
  } = {},
): {
  provider: CubistEscrowProvider;
  invoke: Mock;
} {
  const stdoutBytes =
    options.stdoutBytes ??
    new TextEncoder().encode(
      JSON.stringify(
        Object.hasOwn(options, 'stdout') ? options.stdout : CHALLENGE,
      ),
    );
  const invoke =
    options.invoke === undefined
      ? vi.fn(async () => ({
          response: options.policy ?? { response: 'Allow' },
          stdout: bytesToHex(stdoutBytes),
        }))
      : vi.fn(options.invoke);
  const client = {
    apiClient: { policyInvoke: invoke },
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
  };
}

async function signedReceipt(
  patch: Partial<MutationReceipt> = {},
): Promise<MutationReceipt> {
  const unsigned = {
    mutationId: MUTATION.id,
    requestHash: MUTATION.requestHash,
    escrowId: 'cubist',
    version: MUTATION.newVersion,
    receiptKeyId: await receiptKeyId(receiptKey.publicKey),
    ...patch,
  };
  return {
    ...unsigned,
    signature: await sign(
      receiptKey.privateKey,
      await hashMutationReceipt(unsigned),
    ),
  };
}
