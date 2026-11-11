import { deriveStateFromMetadata } from '@metamask/base-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import { bytesToHex } from '@metamask/utils';
import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import {
  StubAuthProvider,
  StubEscrowProvider,
  StubIdentifierAuthProvider,
  createAuthControllerToken,
  STUB_ENCRYPTION_KEY,
  decryptPending,
  encryptPending,
  getStubPendingOperationKey,
  stubEncryptor,
} from '../tests/stubs.js';
import {
  generateSigningKey,
  generateWrapKey,
  hash,
  unixNow,
} from './crypto.js';
import {
  IncompleteMutationError,
  MfaRecoveryError,
  MutationRejectedError,
} from './errors.js';
import type {
  MfaRecoveryControllerMessenger,
  MfaRecoveryControllerOptions,
} from './MfaRecoveryController.js';
import { MfaRecoveryController } from './MfaRecoveryController.js';
import type {
  Identifier,
  IdentifierSession,
  RecoveredSecret,
  RecoveryEscrowProvider,
  RegisterPayload,
  WritingPendingOperation,
} from './types.js';

const PASSKEY: Identifier = {
  type: 'passkey',
  namespace: 'example.com',
  value: 'cred-1',
  verifier: { publicKey: 'pk' },
};

const SOCIAL: Identifier = {
  type: 'social',
  namespace: 'https://accounts.google.com',
  value: 'hashed-email',
};

const OTHER_PASSKEY: Identifier = { ...PASSKEY, value: 'cred-2' };

const WALLET: Identifier = {
  type: 'siwe',
  namespace: 'example.com:1',
  value: '0xAbC0000000000000000000000000000000000001',
  verifier: { domain: 'example.com', chainId: 1 },
};

const IDENTIFIERS = [PASSKEY, SOCIAL];

const SECRET = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
const SECRET_2 = new Uint8Array([8, 7, 6, 5, 4, 3, 2, 1]);
const REGISTERED_EPOCH = 1;

describe('MfaRecoveryController', () => {
  describe('constructor', () => {
    it('fills in missing initial state with defaults', async () => {
      await withController(({ controller }) => {
        expect(controller.state).toMatchInlineSnapshot(`
          {
            "pendingOperation": null,
          }
        `);
      });
    });

    it('throws if no escrows are configured', () => {
      const rootMessenger = getRootMessenger();
      expect(
        () =>
          new MfaRecoveryController({
            messenger: getMessenger(rootMessenger),
            identifierAuthProvider: new StubIdentifierAuthProvider(),
            escrows: [],
            encryptor: stubEncryptor,
            getPendingOperationKey: getStubPendingOperationKey,
          }),
      ).toThrow('At least one escrow is required');
    });

    it('throws if escrow ids are duplicated', async () => {
      const rootMessenger = getRootMessenger();
      const wrapKey = await generateWrapKey();
      const receiptKey = await generateSigningKey();
      expect(
        () =>
          new MfaRecoveryController({
            messenger: getMessenger(rootMessenger),
            identifierAuthProvider: new StubIdentifierAuthProvider(),
            escrows: [
              new StubEscrowProvider('escrow-a', wrapKey, receiptKey),
              new StubEscrowProvider('escrow-a', wrapKey, receiptKey),
            ],
            encryptor: stubEncryptor,
            getPendingOperationKey: getStubPendingOperationKey,
          }),
      ).toThrow('Duplicate escrow id');
    });
  });

  describe('metadata', () => {
    it('includes expected state in debug snapshots', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'includeInDebugSnapshot',
          ),
        ).toMatchInlineSnapshot(`{}`);
      });
    });

    it('includes expected state in state logs', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'includeInStateLogs',
          ),
        ).toMatchInlineSnapshot(`{}`);
      });
    });

    it('persists expected state', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'persist',
          ),
        ).toMatchInlineSnapshot(`
          {
            "pendingOperation": null,
          }
        `);
      });
    });

    it('exposes expected state to UI', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'usedInUi',
          ),
        ).toMatchInlineSnapshot(`
          {
            "pendingOperation": null,
          }
        `);
      });
    });
  });

  describe('register', () => {
    it('replicates the recovery secret to every escrow', async () => {
      await withController(async ({ controller, escrowA, escrowB }) => {
        const verifyReceipt = vi.spyOn(escrowA, 'verifyReceipt');
        const applyA = vi.spyOn(escrowA, 'applyMutation');
        const applyB = vi.spyOn(escrowB, 'applyMutation');
        await controller.register(SECRET, IDENTIFIERS);
        expect(controller.state.pendingOperation).toBeNull();
        expect(await controller.getPhase()).toBe('idle');
        expect(verifyReceipt.mock.calls[0][2]).toBe('escrow-a');

        const wrappedA = (applyA.mock.calls[0][3] as RegisterPayload)
          .recoverySecret;
        const wrappedB = (applyB.mock.calls[0][3] as RegisterPayload)
          .recoverySecret;
        expect(Object.keys(wrappedA).sort()).toStrictEqual([
          'ciphertext',
          'pkE',
        ]);
        expect(wrappedA.ciphertext).not.toBe(wrappedB.ciphertext);

        const recovered = await recover(controller, PASSKEY);
        expect(bytesToHex(recovered.recoverySecret)).toBe(bytesToHex(SECRET));
      });
    });

    it.each([
      ['an AAL1 approval', { requireVerification: false }, {}],
      ['identifiers the approval does not bind', {}, { identifiers: [SOCIAL] }],
    ])(
      'rejects %s before writing',
      async (_name, paramsPatch, approvalPatch) => {
        await withController(async ({ controller, authProvider, escrowA }) => {
          const approve = authProvider.requestMfaApproval.bind(authProvider);
          vi.spyOn(authProvider, 'requestMfaApproval').mockImplementation(
            async (params) => ({
              ...(await approve({ ...params, ...paramsPatch })),
              ...approvalPatch,
            }),
          );
          const apply = vi.spyOn(escrowA, 'applyMutation');

          await expect(
            controller.register(SECRET, IDENTIFIERS),
          ).rejects.toMatchObject({ code: 'invalid_pending_operation' });
          expect(apply).not.toHaveBeenCalled();
        });
      },
    );

    it('publishes state changes through the stateChanged event', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        const listener = vi.fn();
        rootMessenger.subscribe('MfaRecoveryController:stateChanged', listener);

        await controller.register(SECRET, IDENTIFIERS);

        expect(listener).toHaveBeenCalled();
        expect(listener).toHaveBeenLastCalledWith(
          { pendingOperation: null },
          expect.any(Array),
        );
      });
    });

    it('rejects an empty identifier list', async () => {
      await withController(async ({ controller }) => {
        await expect(controller.register(SECRET, [])).rejects.toThrow(
          'Requires at least 2 identifiers',
        );
      });
    });

    it('rejects a single identifier', async () => {
      await withController(async ({ controller }) => {
        await expect(controller.register(SECRET, [PASSKEY])).rejects.toThrow(
          'Requires at least 2 identifiers',
        );
      });
    });

    it('rejects duplicate identifiers', async () => {
      await withController(async ({ controller }) => {
        await expect(
          controller.register(SECRET, [PASSKEY, PASSKEY]),
        ).rejects.toThrow('Requires at least 2 identifiers');
      });
    });

    it('rejects a second registration for the same profile', async () => {
      await withController(async ({ controller }) => {
        await controller.register(SECRET, IDENTIFIERS);
        await expect(
          controller.register(SECRET, IDENTIFIERS),
        ).rejects.toBeInstanceOf(MutationRejectedError);
        expect(await controller.getPhase()).toBe('idle');
        await controller.updateRecoverySecret(
          PASSKEY,
          SECRET_2,
          REGISTERED_EPOCH,
        );
        expect(await controller.getPhase()).toBe('idle');
      });
    });

    it('does not write when an escrow wrap key is invalid', async () => {
      const escrowA = new StubEscrowProvider(
        'escrow-a',
        await generateWrapKey(),
        await generateSigningKey(),
      );
      const escrowB = new StubEscrowProvider(
        'escrow-b',
        {
          publicKey: new Uint8Array(0),
          privateKey: new Uint8Array(0),
        },
        await generateSigningKey(),
      );
      const applyA = vi.spyOn(escrowA, 'applyMutation');
      const applyB = vi.spyOn(escrowB, 'applyMutation');
      const controller = new MfaRecoveryController(
        getOptions(escrowA, escrowB),
      );

      await expect(controller.register(SECRET, IDENTIFIERS)).rejects.toThrow(
        'Invalid public key length: Public key must be exactly 32 bytes for X25519.',
      );

      expect(applyA).not.toHaveBeenCalled();
      expect(applyB).not.toHaveBeenCalled();
      expect(await controller.getPhase()).toBe('authorizing');
    });
  });

  describe('authenticateIdentifier', () => {
    it('rejects unknown identifier types', async () => {
      await withController(async ({ controller }) => {
        await expect(
          controller.authenticateIdentifier({
            type: 'unknown',
            namespace: 'example.com',
            value: 'unknown',
            verifier: null,
          }),
        ).rejects.toThrow('Unknown identifier type');
      });
    });

    it('binds the returned token to the read request', async () => {
      await withController(async ({ controller }) => {
        const session = await controller.authenticateIdentifier(PASSKEY);

        expect(session.token.requestHash).toBe(
          await hash({
            operation: 'getRecoverySecret',
            requestId: session.requestId,
            pkE: session.pkE,
          }),
        );
      });
    });

    it.each([
      {
        name: 'request id',
        update: (session: IdentifierSession): IdentifierSession => ({
          ...session,
          requestId: `${session.requestId}-tampered`,
        }),
      },
      {
        name: 'ephemeral public key',
        update: (
          session: Awaited<
            ReturnType<MfaRecoveryController['authenticateIdentifier']>
          >,
        ): IdentifierSession => {
          const pkE = new Uint8Array(session.pkE);
          pkE[0] = (pkE[0] + 1) % 256;
          return { ...session, pkE };
        },
      },
    ])('rejects a tampered $name', async ({ update }) => {
      await withController(async ({ controller }) => {
        const session = await controller.authenticateIdentifier(PASSKEY);

        await expect(
          controller.getRecoverySecret(update(session)),
        ).rejects.toMatchObject({
          code: 'invalid_identifier_session',
        });
      });
    });

    it('does not request another token when reading with a session', async () => {
      await withController(async ({ controller, options }) => {
        await controller.register(SECRET, IDENTIFIERS);
        const getToken = vi.spyOn(
          options.identifierAuthProvider,
          'getKeyBoundIdentifierToken',
        );

        const session = await controller.authenticateIdentifier(PASSKEY);
        expect(getToken).toHaveBeenCalledTimes(1);

        await controller.getRecoverySecret(session);
        expect(getToken).toHaveBeenCalledTimes(1);
      });
    });

    it('allows a session to be reused for another read', async () => {
      await withController(async ({ controller }) => {
        await controller.register(SECRET, IDENTIFIERS);
        const session = await controller.authenticateIdentifier(PASSKEY);

        const first = await controller.getRecoverySecret(session);
        expect(first).toStrictEqual(
          expect.objectContaining({ epoch: REGISTERED_EPOCH }),
        );
        const second = await controller.getRecoverySecret(session);
        expect(second).toStrictEqual(
          expect.objectContaining({ epoch: REGISTERED_EPOCH }),
        );
      });
    });
  });

  describe('getRecoverySecret', () => {
    it('requests a request-bound AAL2 approval for each read', async () => {
      await withController(async ({ controller, authProvider, escrowA }) => {
        await controller.register(SECRET, IDENTIFIERS);
        const authorize = vi.spyOn(authProvider, 'requestMfaApproval');
        const generateChallenge = vi.spyOn(escrowA, 'generateChallenge');
        const session = await controller.authenticateIdentifier(PASSKEY);
        await controller.getRecoverySecret(session);
        expect(authorize).toHaveBeenCalledExactlyOnceWith({
          requestHash: session.token.requestHash,
          audiences: ['stub-audience', 'stub-audience'],
          requireVerification: true,
          includeIdentifiers: true,
          reason: { operation: 'mfa_recovery' },
        });
        const { approval } = await authorize.mock.results[0].value;
        expect(generateChallenge).toHaveBeenCalledExactlyOnceWith(approval);
      });
    });

    it('reads the highest version while a mutation is writing', async () => {
      await withController(async ({ controller, escrowA }) => {
        await controller.register(SECRET, IDENTIFIERS);
        escrowA.failNextApplyCount = 1;
        await expect(
          controller.updateRecoverySecret(PASSKEY, SECRET_2, REGISTERED_EPOCH),
        ).rejects.toBeInstanceOf(IncompleteMutationError);

        const recovered = await recover(controller, PASSKEY);

        expect(bytesToHex(recovered.recoverySecret)).toBe(bytesToHex(SECRET_2));
        expect(recovered.epoch).toBe(REGISTERED_EPOCH + 1);
        expect(await controller.getPhase()).toBe('writing');
      });
    });

    it('returns the selected epoch so a later update can be formed', async () => {
      await withController(async ({ controller }) => {
        await controller.register(SECRET, IDENTIFIERS);
        const recovered = await recover(controller, PASSKEY);

        expect(bytesToHex(recovered.recoverySecret)).toBe(bytesToHex(SECRET));
        expect(recovered.epoch).toBe(REGISTERED_EPOCH);

        await controller.updateRecoverySecret(
          PASSKEY,
          SECRET_2,
          recovered.epoch,
        );
        const afterUpdate = await recover(controller, PASSKEY);
        expect(bytesToHex(afterUpdate.recoverySecret)).toBe(
          bytesToHex(SECRET_2),
        );
        expect(afterUpdate.epoch).toBe(REGISTERED_EPOCH + 1);
      });
    });

    it('returns the highest consistent version when one escrow is down', async () => {
      await withController(async ({ controller, escrowB }) => {
        await controller.register(SECRET, IDENTIFIERS);
        escrowB.available = false;
        const recovered = await recover(controller, PASSKEY);
        expect(bytesToHex(recovered.recoverySecret)).toBe(bytesToHex(SECRET));
      });
    });

    it('propagates an availability error instead of skipping the escrow', async () => {
      await withController(async ({ controller, escrowA }) => {
        await controller.register(SECRET, IDENTIFIERS);
        const error = new MfaRecoveryError(
          'Feature disabled',
          'feature_disabled',
        );
        vi.spyOn(escrowA, 'isAvailable').mockRejectedValue(error);

        await expect(recover(controller, PASSKEY)).rejects.toBe(error);
      });
    });

    it('continues reading when key-bound authorization fails for one escrow', async () => {
      await withController(async ({ controller, escrowA }) => {
        await controller.register(SECRET, IDENTIFIERS);
        vi.spyOn(escrowA, 'generateChallenge').mockRejectedValue(
          new Error('challenge failed'),
        );

        const recovered = await recover(controller, PASSKEY);

        expect(bytesToHex(recovered.recoverySecret)).toBe(bytesToHex(SECRET));
      });
    });

    it('continues reading when an escrow returns an unexpected wrap key id', async () => {
      await withController(async ({ controller, escrowA }) => {
        await controller.register(SECRET, IDENTIFIERS);
        vi.spyOn(escrowA, 'getSecret').mockResolvedValue({
          recoverySecret: { ciphertext: new Uint8Array([0xaa]) },
          version: 1,
          lastMutationId: '0x',
          wrapKeyId: '0xdead',
        });
        const recovered = await recover(controller, PASSKEY);
        expect(bytesToHex(recovered.recoverySecret)).toBe(bytesToHex(SECRET));
      });
    });

    it('throws when matching versions disagree', async () => {
      await withController(async ({ controller, escrowB }) => {
        await controller.register(SECRET, IDENTIFIERS);
        escrowB.patchRecord('profile-1', {
          lastMutationId: '0xdifferent',
        });
        await expect(recover(controller, PASSKEY)).rejects.toThrow(
          'Replica corruption',
        );
      });
    });

    it('throws when no escrow is available', async () => {
      await withController(async ({ controller, escrowA, escrowB }) => {
        escrowA.available = false;
        escrowB.available = false;
        await expect(recover(controller, PASSKEY)).rejects.toThrow(
          'No escrow is available',
        );
      });
    });

    it('throws when every available escrow fails the read', async () => {
      await withController(async ({ controller, escrowA, escrowB }) => {
        await controller.register(SECRET, IDENTIFIERS);
        escrowA.failGetSecret = true;
        escrowB.failGetSecret = true;
        await expect(recover(controller, PASSKEY)).rejects.toThrow(
          'No escrow returned a recovery secret',
        );
      });
    });
  });

  describe('configured escrows', () => {
    it('uses a snapshot of the configured escrow array', async () => {
      await withController(
        async ({ controller, escrowA, escrowB, options }) => {
          options.escrows.splice(0, options.escrows.length);

          await controller.register(SECRET, IDENTIFIERS);

          expect(await escrowA.getRecoveryMetadata('profile-1')).toStrictEqual({
            version: 1,
            lastMutationId: expect.any(String) as string,
          });
          expect(await escrowB.getRecoveryMetadata('profile-1')).toStrictEqual({
            version: 1,
            lastMutationId: expect.any(String) as string,
          });
        },
      );
    });
  });

  describe('updateRecoverySecret', () => {
    it('replaces the secret at every escrow', async () => {
      await withController(async ({ controller, escrowA }) => {
        const generateChallenge = vi.spyOn(escrowA, 'generateChallenge');
        await controller.register(SECRET, IDENTIFIERS);
        const apply = vi.spyOn(escrowA, 'applyMutation');
        await controller.updateRecoverySecret(
          PASSKEY,
          SECRET_2,
          REGISTERED_EPOCH,
        );
        expect(generateChallenge).toHaveBeenCalledExactlyOnceWith(
          apply.mock.calls[0][1],
        );
        const recovered = await recover(controller, PASSKEY);
        expect(bytesToHex(recovered.recoverySecret)).toBe(bytesToHex(SECRET_2));
      });
    });

    it('throws when a configured escrow is unavailable', async () => {
      await withController(async ({ controller, escrowB, options }) => {
        await controller.register(SECRET, IDENTIFIERS);
        escrowB.available = false;
        const auth = vi.spyOn(options.authProvider, 'requestMfaApproval');
        auth.mockClear();
        await expect(
          controller.updateRecoverySecret(PASSKEY, SECRET_2, REGISTERED_EPOCH),
        ).rejects.toThrow('All configured escrows are required for mutation');
        expect(auth).not.toHaveBeenCalled();
        expect(await controller.getPhase()).toBe('idle');
      });
    });

    it('propagates an availability error instead of reporting the escrow unavailable', async () => {
      await withController(async ({ controller, escrowB }) => {
        await controller.register(SECRET, IDENTIFIERS);
        const error = new MfaRecoveryError(
          'Registration failed',
          'registration_request_failed',
        );
        vi.spyOn(escrowB, 'isAvailable').mockRejectedValue(error);

        await expect(
          controller.updateRecoverySecret(PASSKEY, SECRET_2, REGISTERED_EPOCH),
        ).rejects.toBe(error);
        expect(await controller.getPhase()).toBe('idle');
      });
    });

    it('does not authorize a resumed authorizing mutation when an escrow is unavailable', async () => {
      await withController(async ({ controller, escrowB, options }) => {
        await controller.register(SECRET, IDENTIFIERS);
        const auth = vi
          .spyOn(options.authProvider, 'requestMfaApproval')
          .mockRejectedValueOnce(new Error('auth down'));
        await expect(
          controller.updateRecoverySecret(PASSKEY, SECRET_2, REGISTERED_EPOCH),
        ).rejects.toThrow('auth down');
        expect(await controller.getPhase()).toBe('authorizing');

        escrowB.available = false;
        auth.mockClear();
        await expect(controller.resume()).rejects.toThrow(
          'All configured escrows are required for mutation',
        );
        expect(auth).not.toHaveBeenCalled();
        expect(await controller.getPhase()).toBe('authorizing');
        await controller.abort();
      });
    });

    it('does not write when one escrow cannot be authorized', async () => {
      await withController(async ({ controller, escrowA, escrowB }) => {
        await controller.register(SECRET, IDENTIFIERS);
        vi.spyOn(escrowA, 'generateChallenge').mockRejectedValue(
          new Error('challenge failed'),
        );
        const applyA = vi.spyOn(escrowA, 'applyMutation');
        const applyB = vi.spyOn(escrowB, 'applyMutation');

        await expect(
          controller.updateRecoverySecret(PASSKEY, SECRET_2, REGISTERED_EPOCH),
        ).rejects.toThrow('Unable to authorize every escrow');

        expect(applyA).not.toHaveBeenCalled();
        expect(applyB).not.toHaveBeenCalled();
        expect(await controller.getPhase()).toBe('authorizing');
        await controller.abort();
        expect(await controller.getPhase()).toBe('idle');
      });
    });

    it('persists writing state when every escrow apply fails', async () => {
      await withController(async ({ controller, escrowA, escrowB }) => {
        await controller.register(SECRET, IDENTIFIERS);
        escrowA.failNextApplyCount = 1;
        escrowB.failNextApplyCount = 1;

        await expect(
          controller.updateRecoverySecret(PASSKEY, SECRET_2, REGISTERED_EPOCH),
        ).rejects.toBeInstanceOf(IncompleteMutationError);
        expect(await controller.getPhase()).toBe('writing');
        await controller.resume();
        expect(await controller.getPhase()).toBe('idle');
      });
    });

    it('persists writing state before the first escrow write', async () => {
      await withController(async ({ controller, escrowA }) => {
        await controller.register(SECRET, IDENTIFIERS);

        let releaseApply = (): void => undefined;
        let resolveApplyStarted = (): void => undefined;
        const applyGate = new Promise<void>((resolve) => {
          releaseApply = resolve;
        });
        const applyStarted = new Promise<void>((resolve) => {
          resolveApplyStarted = resolve;
        });
        vi.spyOn(escrowA, 'applyMutation').mockImplementation(async () => {
          resolveApplyStarted();
          await applyGate;
          throw new Error('apply failed');
        });

        const mutation = controller.updateRecoverySecret(
          PASSKEY,
          SECRET_2,
          REGISTERED_EPOCH,
        );
        await applyStarted;

        expect(
          await decryptPending(controller.state.pendingOperation as string),
        ).toStrictEqual(
          expect.objectContaining({
            phase: 'writing',
            receipts: [],
          }),
        );

        releaseApply();
        await expect(mutation).rejects.toBeInstanceOf(IncompleteMutationError);
      });
    });

    it('throws when replicas disagree on version', async () => {
      await withController(async ({ controller, escrowB }) => {
        await controller.register(SECRET, IDENTIFIERS);
        escrowB.patchRecord('profile-1', { version: 2 });
        await expect(
          controller.updateRecoverySecret(PASSKEY, SECRET_2, REGISTERED_EPOCH),
        ).rejects.toBeInstanceOf(IncompleteMutationError);
        expect(await controller.getPhase()).toBe('writing');
        await expect(controller.abort()).rejects.toThrow(
          'Cannot abort a mutation that may have been applied',
        );
      });
    });

    it('drops an update every escrow rejects for a stale epoch', async () => {
      await withController(async ({ controller }) => {
        await controller.register(SECRET, IDENTIFIERS);
        await expect(
          controller.updateRecoverySecret(PASSKEY, SECRET_2, 0),
        ).rejects.toBeInstanceOf(MutationRejectedError);
        expect(await controller.getPhase()).toBe('idle');
        await controller.updateRecoverySecret(
          PASSKEY,
          SECRET_2,
          REGISTERED_EPOCH,
        );
        expect(
          bytesToHex((await recover(controller, PASSKEY)).recoverySecret),
        ).toBe(bytesToHex(SECRET_2));
      });
    });

    it('cannot abort a writing mutation that may have been applied', async () => {
      let now = unixNow();
      await withController(async ({ escrowA, options }) => {
        const controller = new MfaRecoveryController({
          ...options,
          messenger: getMessenger(getRootMessenger(options.authProvider)),
          now: (): number => now,
        });
        await controller.register(SECRET, IDENTIFIERS);
        escrowA.failNextApplyCount = 1;
        await expect(
          controller.updateRecoverySecret(PASSKEY, SECRET_2, REGISTERED_EPOCH),
        ).rejects.toBeInstanceOf(IncompleteMutationError);
        expect(await controller.getPhase()).toBe('writing');
        now += 10 * 60;
        await expect(controller.abort()).rejects.toThrow(
          'Cannot abort a mutation that may have been applied',
        );
        expect(await controller.getPhase()).toBe('writing');
      });
    });

    it('refuses a new mutation while one is pending', async () => {
      await withController(async ({ controller, escrowA }) => {
        await controller.register(SECRET, IDENTIFIERS);
        escrowA.failNextApplyCount = 1;
        await expect(
          controller.updateRecoverySecret(PASSKEY, SECRET_2, REGISTERED_EPOCH),
        ).rejects.toBeInstanceOf(IncompleteMutationError);
        await expect(
          controller.updateRecoverySecret(PASSKEY, SECRET_2, REGISTERED_EPOCH),
        ).rejects.toThrow(
          'A pending mutation must be resumed or aborted first',
        );
        expect(await controller.getPhase()).toBe('writing');
        await controller.resume();
        expect(await controller.getPhase()).toBe('idle');
      });
    });

    it('throws when a replica is missing the recovery record', async () => {
      await withController(async ({ controller, escrowB }) => {
        await controller.register(SECRET, IDENTIFIERS);
        escrowB.clearRecord('profile-1');
        await expect(
          controller.updateRecoverySecret(PASSKEY, SECRET_2, REGISTERED_EPOCH),
        ).rejects.toBeInstanceOf(IncompleteMutationError);
      });
    });

    it('throws when the supplied epoch is invalid', async () => {
      await withController(async ({ controller }) => {
        await controller.register(SECRET, IDENTIFIERS);
        await expect(
          controller.updateRecoverySecret(PASSKEY, SECRET_2, 1.5),
        ).rejects.toThrow('Invalid epoch');
      });
    });
  });

  describe('getIdentifiers', () => {
    it('returns the enrolled identifiers, epoch and Auth identifiers', async () => {
      await withController(async ({ controller, authProvider }) => {
        await controller.register(SECRET, IDENTIFIERS);
        authProvider.identifiers = [...IDENTIFIERS, OTHER_PASSKEY];
        const authorize = vi.spyOn(authProvider, 'requestMfaApproval');
        expect(await controller.getIdentifiers()).toStrictEqual({
          identifiers: IDENTIFIERS,
          epoch: REGISTERED_EPOCH,
          authIdentifiers: authProvider.identifiers,
        });
        expect(authorize).toHaveBeenCalledExactlyOnceWith({
          requestHash: await hash({ operation: 'getIdentifiers' }),
          audiences: ['stub-audience', 'stub-audience'],
          requireVerification: false,
          includeIdentifiers: true,
          reason: { operation: 'mfa_recovery' },
        });
      });
    });

    it('returns no Auth identifiers when the approval omits them', async () => {
      await withController(async ({ controller, authProvider }) => {
        await controller.register(SECRET, IDENTIFIERS);
        const approve = authProvider.requestMfaApproval.bind(authProvider);
        vi.spyOn(authProvider, 'requestMfaApproval').mockImplementation(
          async (request) => {
            const { identifiers: _identifiers, ...approval } =
              await approve(request);
            return approval;
          },
        );
        expect(await controller.getIdentifiers()).toMatchObject({
          authIdentifiers: [],
        });
      });
    });

    it('returns the highest version when one escrow is behind', async () => {
      await withController(async ({ controller, escrowA, options }) => {
        await controller.register(SECRET, IDENTIFIERS);
        options.authProvider.identifiers = [...IDENTIFIERS, OTHER_PASSKEY];
        escrowA.failNextApplyCount = 1;
        await expect(
          controller.updateIdentifiers(
            PASSKEY,
            [SOCIAL, OTHER_PASSKEY],
            REGISTERED_EPOCH,
          ),
        ).rejects.toBeInstanceOf(IncompleteMutationError);
        expect(await controller.getIdentifiers()).toMatchObject({
          identifiers: [SOCIAL, OTHER_PASSKEY],
          epoch: REGISTERED_EPOCH + 1,
        });
      });
    });

    it('throws when replicas at the same version disagree', async () => {
      await withController(async ({ controller, escrowA }) => {
        await controller.register(SECRET, IDENTIFIERS);
        vi.spyOn(escrowA, 'getIdentifiers').mockResolvedValue({
          identifiers: [SOCIAL, OTHER_PASSKEY],
          version: REGISTERED_EPOCH,
        });
        await expect(controller.getIdentifiers()).rejects.toMatchObject({
          code: 'replica_corruption',
        });
      });
    });

    it('throws when no escrow returns identifiers', async () => {
      await withController(async ({ controller }) => {
        await expect(controller.getIdentifiers()).rejects.toMatchObject({
          code: 'read_failed',
        });
      });
    });

    it('throws when no escrow is available', async () => {
      await withController(async ({ controller, escrowA, escrowB }) => {
        escrowA.available = false;
        escrowB.available = false;
        await expect(controller.getIdentifiers()).rejects.toMatchObject({
          code: 'no_available_escrow',
        });
      });
    });
  });

  describe('updateIdentifiers', () => {
    it('replaces the identifier set', async () => {
      await withController(async ({ controller }) => {
        await controller.register(SECRET, IDENTIFIERS);
        await controller.updateIdentifiers(
          PASSKEY,
          [SOCIAL, PASSKEY],
          REGISTERED_EPOCH,
        );
        const recovered = await recover(controller, SOCIAL);
        expect(bytesToHex(recovered.recoverySecret)).toBe(bytesToHex(SECRET));
      });
    });

    it('rejects an empty identifier list', async () => {
      await withController(async ({ controller }) => {
        await controller.register(SECRET, IDENTIFIERS);
        await expect(
          controller.updateIdentifiers(PASSKEY, [], REGISTERED_EPOCH),
        ).rejects.toThrow('Requires at least 2 identifiers');
      });
    });
  });

  describe('Auth identifiers', () => {
    it('requests Auth identifiers with every approval', async () => {
      await withController(async ({ controller, authProvider }) => {
        const authorize = vi.spyOn(authProvider, 'requestMfaApproval');
        await controller.register(SECRET, IDENTIFIERS);
        await controller.getIdentifiers();
        await recover(controller, PASSKEY);
        expect(authorize).toHaveBeenCalledTimes(3);
        for (const [request] of authorize.mock.calls) {
          expect(request.includeIdentifiers).toBe(true);
        }
      });
    });

    it('binds mutations to the canonical profile id', async () => {
      await withController(async ({ controller, authProvider, escrowA }) => {
        authProvider.profileId = 'canonical-profile';
        const refresh = vi.spyOn(authProvider, 'refreshCanonicalProfileId');
        const apply = vi.spyOn(escrowA, 'applyMutation');
        await controller.register(SECRET, IDENTIFIERS);
        expect(refresh).toHaveBeenCalledOnce();
        expect(apply.mock.calls[0][0].profileId).toBe('canonical-profile');
      });
    });

    it('sends the caller identifiers with all Auth-approved identifiers', async () => {
      await withController(async ({ controller, authProvider, escrowA }) => {
        authProvider.identifiers = [SOCIAL, OTHER_PASSKEY, PASSKEY];
        const authorize = vi.spyOn(authProvider, 'requestMfaApproval');
        const apply = vi.spyOn(escrowA, 'applyMutation');
        await controller.register(SECRET, IDENTIFIERS);
        expect(authorize).toHaveBeenCalledExactlyOnceWith({
          requestHash: apply.mock.calls[0][0].requestHash,
          audiences: ['stub-audience', 'stub-audience'],
          requireVerification: true,
          includeIdentifiers: true,
          reason: { operation: 'mfa_recovery' },
        });
        expect(apply.mock.calls[0][3]).toMatchObject({
          identifiers: IDENTIFIERS,
        });
        expect(apply.mock.calls[0][4]).toStrictEqual(authProvider.identifiers);
      });
    });

    it.each([
      ['an identifier Auth did not approve', [SOCIAL, OTHER_PASSKEY]],
      [
        'a stale passkey verifier',
        [{ ...PASSKEY, verifier: { publicKey: 'rotated' } }, SOCIAL],
      ],
    ])(
      'rejects %s before writing, leaving the mutation abortable',
      async (_name, approved) => {
        await withController(async ({ controller, authProvider, escrowA }) => {
          authProvider.identifiers = approved;
          const apply = vi.spyOn(escrowA, 'applyMutation');
          await expect(
            controller.register(SECRET, IDENTIFIERS),
          ).rejects.toMatchObject({ code: 'invalid_pending_operation' });
          expect(apply).not.toHaveBeenCalled();
          expect(await controller.getPhase()).toBe('authorizing');
          await controller.abort();
          expect(await controller.getPhase()).toBe('idle');
        });
      },
    );
  });

  describe('SIWE identifiers', () => {
    const LOWERCASE_WALLET = { ...WALLET, value: WALLET.value.toLowerCase() };
    it.each([
      [
        'only address casing variants',
        [WALLET, LOWERCASE_WALLET],
        'too_few_identifiers',
      ],
      [
        'address casing duplicates',
        [PASSKEY, WALLET, LOWERCASE_WALLET],
        'duplicate_identifier',
      ],
      [
        'a malformed address',
        [PASSKEY, { ...WALLET, value: '0x1234' }],
        'invalid_identifier',
      ],
      ...['example.com/login', 'example .com'].map((domain) => [
        `the domain ${domain}`,
        [
          PASSKEY,
          {
            ...WALLET,
            namespace: `${domain}:1`,
            verifier: { domain, chainId: 1 },
          },
        ],
        'invalid_identifier',
      ]),
      [
        'more than 16 identifiers',
        Array.from({ length: 17 }, (_, index) => ({
          ...SOCIAL,
          value: `user-${index}`,
        })),
        'too_many_identifiers',
      ],
    ] as [string, Identifier[], string][])(
      'rejects %s before authorization',
      async (_, identifiers, code) => {
        await withController(async ({ controller, authProvider, options }) => {
          const authorize = vi.spyOn(authProvider, 'requestMfaApproval');
          const getIdentifierToken = vi.spyOn(
            options.identifierAuthProvider,
            'getKeyBoundIdentifierToken',
          );

          await expect(
            controller.register(SECRET, identifiers),
          ).rejects.toMatchObject({ code });
          await expect(
            controller.updateIdentifiers(
              PASSKEY,
              identifiers,
              REGISTERED_EPOCH,
            ),
          ).rejects.toMatchObject({ code });
          expect(authorize).not.toHaveBeenCalled();
          expect(getIdentifierToken).not.toHaveBeenCalled();
          expect(controller.state.pendingOperation).toBeNull();
        });
      },
    );

    it('proves each SIWE identifier at register', async () => {
      await withController(async ({ controller, escrowA }) => {
        const apply = vi.spyOn(escrowA, 'applyMutation');
        await controller.register(SECRET, [PASSKEY, WALLET]);
        expect(
          apply.mock.calls[0][2].map(({ token }) => token.identifier),
        ).toStrictEqual([WALLET]);
      });
    });

    it('proves an added SIWE identifier with the enrolled identifier on one challenge', async () => {
      await withController(async ({ controller, escrowA }) => {
        await controller.register(SECRET, IDENTIFIERS);
        const apply = vi.spyOn(escrowA, 'applyMutation');
        await controller.updateIdentifiers(
          PASSKEY,
          [SOCIAL, WALLET],
          REGISTERED_EPOCH,
        );
        const authorizations = apply.mock.calls[0][2];
        expect(
          authorizations.map(({ token }) => token.identifier),
        ).toStrictEqual([PASSKEY, WALLET]);
        expect(
          new Set(authorizations.map(({ proof }) => proof.challengeId)).size,
        ).toBe(1);
      });
    });

    it('does not prove an enrolled SIWE identifier in another address case', async () => {
      await withController(async ({ controller, escrowA }) => {
        await controller.register(SECRET, [PASSKEY, WALLET]);
        const apply = vi.spyOn(escrowA, 'applyMutation');
        await controller.updateIdentifiers(
          PASSKEY,
          [SOCIAL, { ...WALLET, value: WALLET.value.toLowerCase() }],
          REGISTERED_EPOCH,
        );
        expect(
          apply.mock.calls[0][2].map(({ token }) => token.identifier),
        ).toStrictEqual([PASSKEY]);
      });
    });

    it('does not prove SIWE identifiers to an escrow that already applied the mutation', async () => {
      await withController(async ({ controller, escrowA }) => {
        await controller.register(SECRET, IDENTIFIERS);
        escrowA.invalidReceipts = true;
        await expect(
          controller.updateIdentifiers(
            PASSKEY,
            [SOCIAL, WALLET],
            REGISTERED_EPOCH,
          ),
        ).rejects.toThrow('Invalid mutation receipt');
        escrowA.invalidReceipts = false;
        const apply = vi.spyOn(escrowA, 'applyMutation');
        await controller.resume();
        expect(
          apply.mock.calls[0][2].map(({ token }) => token.identifier),
        ).toStrictEqual([PASSKEY]);
        expect(await controller.getPhase()).toBe('idle');
      });
    });
  });

  describe('resume and abort', () => {
    it('resumes a persisted writing mutation after a replica failure', async () => {
      await withController(async ({ controller, escrowA }) => {
        await controller.register(SECRET, IDENTIFIERS);
        escrowA.failNextApplyCount = 1;
        await expect(
          controller.updateRecoverySecret(PASSKEY, SECRET_2, REGISTERED_EPOCH),
        ).rejects.toBeInstanceOf(IncompleteMutationError);
        expect(await controller.getPhase()).toBe('writing');

        await controller.resume();
        expect(await controller.getPhase()).toBe('idle');
        const recovered = await recover(controller, PASSKEY);
        expect(bytesToHex(recovered.recoverySecret)).toBe(bytesToHex(SECRET_2));
      });
    });

    it('clears a persisted writing mutation that every escrow rejects', async () => {
      await withController(
        async ({ controller, escrowA, escrowB, options }) => {
          await controller.register(SECRET, IDENTIFIERS);
          const pending = await getValidWritingPending([escrowA, escrowB], 0);
          const resumed = new MfaRecoveryController({
            ...options,
            messenger: getMessenger(getRootMessenger(options.authProvider)),
            state: {
              pendingOperation: await encryptPending(pending),
            },
          });

          await expect(resumed.resume()).rejects.toBeInstanceOf(
            MutationRejectedError,
          );
          expect(await resumed.getPhase()).toBe('idle');
          await resumed.updateRecoverySecret(
            PASSKEY,
            SECRET_2,
            REGISTERED_EPOCH,
          );
          expect(await resumed.getPhase()).toBe('idle');
        },
      );
    });

    it('keeps a writing mutation that one escrow already acknowledged', async () => {
      await withController(async ({ controller, escrowA }) => {
        await controller.register(SECRET, IDENTIFIERS);
        escrowA.failNextApplyCount = 1;
        await expect(
          controller.updateRecoverySecret(PASSKEY, SECRET_2, REGISTERED_EPOCH),
        ).rejects.toBeInstanceOf(IncompleteMutationError);
        escrowA.patchRecord('profile-1', { version: 9 });

        await expect(controller.resume()).rejects.toBeInstanceOf(
          IncompleteMutationError,
        );
        expect(await controller.getPhase()).toBe('writing');
        await expect(controller.abort()).rejects.toThrow(
          'Cannot abort a mutation that may have been applied',
        );
      });
    });

    it('repairs only the missing replica when an acknowledged replica is offline', async () => {
      await withController(async ({ controller, escrowA, escrowB }) => {
        await controller.register(SECRET, IDENTIFIERS);
        escrowA.failNextApplyCount = 1;
        await expect(
          controller.updateRecoverySecret(PASSKEY, SECRET_2, REGISTERED_EPOCH),
        ).rejects.toBeInstanceOf(IncompleteMutationError);

        escrowB.available = false;

        await controller.resume();

        expect(await controller.getPhase()).toBe('idle');
        expect(
          bytesToHex((await recover(controller, PASSKEY)).recoverySecret),
        ).toBe(bytesToHex(SECRET_2));
      });
    });

    it('clears a fully acknowledged mutation without checking escrow availability', async () => {
      await withController(async ({ controller, escrowA, escrowB }) => {
        await controller.register(SECRET, IDENTIFIERS);
        const pending = await getValidWritingPending([escrowA, escrowB]);
        pending.receipts = await Promise.all(
          [escrowA, escrowB].map(async (escrow) =>
            escrow.createReceipt(pending.mutation),
          ),
        );
        const encrypted = await encryptPending(pending);
        const availabilityA = vi.spyOn(escrowA, 'isAvailable');
        const availabilityB = vi.spyOn(escrowB, 'isAvailable');
        availabilityA.mockClear();
        availabilityB.mockClear();
        escrowA.available = false;
        escrowB.available = false;

        const resumed = new MfaRecoveryController({
          ...getOptions(escrowA, escrowB),
          state: {
            pendingOperation: encrypted,
          },
        });

        await resumed.resume();

        expect(await resumed.getPhase()).toBe('idle');
        expect(availabilityA).not.toHaveBeenCalled();
        expect(availabilityB).not.toHaveBeenCalled();
      });
    });

    it('aborts a writing mutation no escrow applied once its approval expires', async () => {
      let now = unixNow();
      await withController(async ({ escrowA, escrowB, options }) => {
        const controller = new MfaRecoveryController({
          ...options,
          messenger: getMessenger(getRootMessenger(options.authProvider)),
          now: (): number => now,
        });
        await controller.register(SECRET, IDENTIFIERS);
        escrowA.failNextApplyCount = 1;
        escrowB.failNextApplyCount = 1;
        await expect(
          controller.updateRecoverySecret(PASSKEY, SECRET_2, REGISTERED_EPOCH),
        ).rejects.toBeInstanceOf(IncompleteMutationError);
        await expect(controller.abort()).rejects.toThrow(
          'Cannot abort a mutation that may have been applied',
        );

        now += 10 * 60;
        vi.spyOn(escrowB, 'getIdentifiers').mockRejectedValueOnce(
          new Error('offline'),
        );
        await expect(controller.abort()).rejects.toThrow(
          'Cannot abort a mutation that may have been applied',
        );
        await controller.abort();

        expect(await controller.getPhase()).toBe('idle');
      });
    });

    it('clears instead of resuming a writing mutation no escrow applied once its approval expires', async () => {
      let now = unixNow();
      await withController(async ({ escrowA, escrowB, options }) => {
        const controller = new MfaRecoveryController({
          ...options,
          messenger: getMessenger(getRootMessenger(options.authProvider)),
          now: (): number => now,
        });
        await controller.register(SECRET, IDENTIFIERS);
        escrowA.failNextApplyCount = 1;
        escrowB.failNextApplyCount = 1;
        await expect(
          controller.updateRecoverySecret(PASSKEY, SECRET_2, REGISTERED_EPOCH),
        ).rejects.toBeInstanceOf(IncompleteMutationError);
        const authorize = vi.spyOn(options.authProvider, 'requestMfaApproval');

        now += 10 * 60;
        await expect(controller.resume()).rejects.toBeInstanceOf(
          MutationRejectedError,
        );

        expect(await controller.getPhase()).toBe('idle');
        expect(authorize).not.toHaveBeenCalledWith(
          expect.objectContaining({ requireVerification: true }),
        );
      });
    });

    it('aborts a writing mutation no escrow applied when an escrow lags', async () => {
      let now = unixNow();
      await withController(async ({ escrowA, escrowB, options }) => {
        const controller = new MfaRecoveryController({
          ...options,
          messenger: getMessenger(getRootMessenger(options.authProvider)),
          now: (): number => now,
        });
        await controller.register(SECRET, IDENTIFIERS);
        escrowA.patchRecord('profile-1', { version: REGISTERED_EPOCH + 1 });
        escrowA.failNextApplyCount = 1;
        escrowB.failNextApplyCount = 1;
        await expect(
          controller.updateRecoverySecret(
            PASSKEY,
            SECRET_2,
            REGISTERED_EPOCH + 1,
          ),
        ).rejects.toBeInstanceOf(IncompleteMutationError);

        now += 10 * 60;
        await controller.abort();

        expect(await controller.getPhase()).toBe('idle');
      });
    });

    it('aborts a writing register no escrow applied once its approval expires', async () => {
      let now = unixNow();
      await withController(async ({ escrowA, escrowB, options }) => {
        const controller = new MfaRecoveryController({
          ...options,
          messenger: getMessenger(getRootMessenger(options.authProvider)),
          now: (): number => now,
        });
        escrowA.failNextApplyCount = 1;
        escrowB.failNextApplyCount = 1;
        await expect(
          controller.register(SECRET, IDENTIFIERS),
        ).rejects.toBeInstanceOf(IncompleteMutationError);
        // Escrows read a missing record as version 0.
        for (const escrow of [escrowA, escrowB]) {
          vi.spyOn(escrow, 'getIdentifiers').mockResolvedValue({
            identifiers: [],
            version: 0,
          });
        }

        now += 10 * 60;
        await controller.abort();

        expect(await controller.getPhase()).toBe('idle');
      });
    });

    it('aborts an authorizing mutation and refuses to abort writing', async () => {
      await withController(async ({ options }) => {
        const validPending = await getValidWritingPending(options.escrows);
        const authorizing = await encryptPending({
          phase: 'authorizing',
          mutation: validPending.mutation,
          payload: validPending.payload,
          identifier: validPending.identifier,
        });
        const authorizingMessenger = getMessenger(
          getRootMessenger(options.authProvider),
        );
        const idleController = new MfaRecoveryController({
          ...options,
          messenger: authorizingMessenger,
          state: {
            pendingOperation: authorizing,
          },
        });
        expect(await idleController.getPhase()).toBe('authorizing');
        await idleController.abort();
        expect(await idleController.getPhase()).toBe('idle');

        const writing = await encryptPending({
          ...validPending,
          receipts: [
            {
              mutationId: validPending.mutation.id,
              requestHash: validPending.mutation.requestHash,
              escrowId: 'escrow-a',
              version: validPending.mutation.newVersion,
              receiptKeyId: '0xreceipt',
              signature: '0xsignature',
            },
          ],
        });
        const writingMessenger = getMessenger(
          getRootMessenger(options.authProvider),
        );
        const writingController = new MfaRecoveryController({
          ...options,
          messenger: writingMessenger,
          state: {
            pendingOperation: writing,
          },
        });
        await expect(writingController.abort()).rejects.toThrow(
          'Cannot abort a mutation that may have been applied',
        );
        expect(await writingController.getPhase()).toBe('writing');
      });
    });

    it('resumes an authorizing mutation', async () => {
      await withController(async ({ options }) => {
        const payload = {
          identifiers: IDENTIFIERS,
          recoverySecret: bytesToHex(SECRET),
        };
        const payloadHash = await hash(payload);
        const fields = {
          id: '0xmutauth',
          profileId: 'profile-1',
          operation: 'register' as const,
          expectedVersion: 0,
          newVersion: 1,
          payloadHash,
          audiences: ['escrow-a', 'escrow-b'],
        };
        const mutation = {
          ...fields,
          requestHash: await hash(fields),
        };
        const authorizing = await encryptPending({
          phase: 'authorizing',
          mutation,
          payload,
          identifier: null,
        });
        const controller = new MfaRecoveryController({
          ...options,
          messenger: getMessenger(getRootMessenger(options.authProvider)),
          state: {
            pendingOperation: authorizing,
          },
        });
        await controller.resume();
        expect(await controller.getPhase()).toBe('idle');
        expect(
          bytesToHex((await recover(controller, PASSKEY)).recoverySecret),
        ).toBe(bytesToHex(SECRET));
      });
    });

    it('resumes a persisted authorizing updateIdentifiers mutation', async () => {
      await withController(async ({ controller, options }) => {
        await controller.register(SECRET, IDENTIFIERS);
        const payload = { identifiers: IDENTIFIERS };
        const payloadHash = await hash(payload);
        const mutationFields = {
          id: '0xmutidentifiers',
          profileId: 'profile-1',
          operation: 'updateIdentifiers' as const,
          expectedVersion: 1,
          newVersion: 2,
          payloadHash,
          audiences: ['escrow-a', 'escrow-b'],
        };
        const mutation = {
          ...mutationFields,
          requestHash: await hash(mutationFields),
        };
        const authorizing = {
          phase: 'authorizing' as const,
          mutation,
          payload,
          identifier: PASSKEY,
        };
        const resumed = new MfaRecoveryController({
          ...options,
          messenger: getMessenger(getRootMessenger(options.authProvider)),
          state: {
            pendingOperation: await encryptPending(authorizing),
          },
        });

        await resumed.resume();

        expect(await resumed.getPhase()).toBe('idle');
        expect(
          bytesToHex((await recover(resumed, PASSKEY)).recoverySecret),
        ).toBe(bytesToHex(SECRET));
      });
    });

    it('is a no-op to resume or abort when idle', async () => {
      await withController(async ({ controller }) => {
        await controller.resume();
        await controller.abort();
        expect(await controller.getPhase()).toBe('idle');
      });
    });

    it('clears a writing mutation that already has every receipt', async () => {
      await withController(
        async ({ controller, options, escrowA, escrowB }) => {
          await controller.register(SECRET, IDENTIFIERS);
          const payload = {
            recoverySecret: bytesToHex(SECRET_2),
          };
          const mutation = {
            id: '0xmut',
            profileId: 'profile-1',
            operation: 'updateRecoverySecret' as const,
            expectedVersion: 1,
            newVersion: 2,
            payloadHash: await hash(payload),
            audiences: ['escrow-a', 'escrow-b'],
            requestHash: '0x',
          };
          mutation.requestHash = await hash({
            id: mutation.id,
            profileId: mutation.profileId,
            operation: mutation.operation,
            expectedVersion: mutation.expectedVersion,
            newVersion: mutation.newVersion,
            payloadHash: mutation.payloadHash,
            audiences: mutation.audiences,
          });
          const receipts = [
            await escrowA.createReceipt(mutation),
            await escrowB.createReceipt(mutation),
          ];
          const writing = await encryptPending({
            phase: 'writing',
            mutation,
            authControllerToken: createAuthControllerToken({
              sub: 'profile-1',
              exp: unixNow() + 60,
              requestHash: mutation.requestHash,
              aal: 2,
            }),
            approvedIdentifiers: IDENTIFIERS,
            payload,
            identifier: PASSKEY,
            receipts,
          });
          const resumed = new MfaRecoveryController({
            ...options,
            messenger: getMessenger(getRootMessenger(options.authProvider)),
            state: {
              pendingOperation: writing,
            },
          });
          await resumed.resume();
          expect(await resumed.getPhase()).toBe('idle');
        },
      );
    });

    it('rejects a persisted mutation with the wrong escrow audience', async () => {
      await withController(async ({ options }) => {
        const writing = await encryptPending({
          phase: 'authorizing',
          mutation: {
            id: '0xmut',
            profileId: 'profile-1',
            operation: 'register',
            expectedVersion: 0,
            newVersion: 1,
            payloadHash: '0x',
            audiences: ['escrow-other'],
            requestHash: '0x',
          },
          payload: {
            recoverySecret: bytesToHex(SECRET),
            identifiers: IDENTIFIERS,
          },
          identifier: null,
        });
        const controller = new MfaRecoveryController({
          ...options,
          messenger: getMessenger(getRootMessenger(options.authProvider)),
          state: {
            pendingOperation: writing,
          },
        });
        await expect(controller.resume()).rejects.toThrow(
          'Persisted mutation audiences do not match configured escrows',
        );
      });
    });

    it('rejects a pending payload that does not match the mutation hash', async () => {
      await withController(async ({ options }) => {
        const writing = await encryptPending({
          phase: 'writing',
          mutation: {
            id: '0xmut',
            profileId: 'profile-1',
            operation: 'register',
            expectedVersion: 0,
            newVersion: 1,
            payloadHash: '0xdead',
            audiences: ['escrow-a', 'escrow-b'],
            requestHash: '0x',
          },
          authControllerToken: createAuthControllerToken({
            sub: 'profile-1',
            exp: unixNow() + 60,
            requestHash: '0x',
          }),
          approvedIdentifiers: IDENTIFIERS,
          payload: {
            recoverySecret: bytesToHex(SECRET),
            identifiers: IDENTIFIERS,
          },
          identifier: null,
          receipts: [],
        });
        const controller = new MfaRecoveryController({
          ...options,
          messenger: getMessenger(getRootMessenger(options.authProvider)),
          state: {
            pendingOperation: writing,
          },
        });
        await expect(controller.resume()).rejects.toThrow(
          'Pending payload does not match mutation',
        );
      });
    });

    it('rejects a receipt from an unknown escrow', async () => {
      await withController(async ({ options }) => {
        const payload = {
          identifiers: IDENTIFIERS,
          recoverySecret: bytesToHex(SECRET),
        };
        const payloadHash = await hash(payload);
        const mutation = {
          id: '0xmut',
          profileId: 'profile-1',
          operation: 'register' as const,
          expectedVersion: 0,
          newVersion: 1,
          payloadHash,
          audiences: ['escrow-a', 'escrow-b'],
          requestHash: '',
        };
        mutation.requestHash = await hash({
          id: mutation.id,
          profileId: mutation.profileId,
          operation: mutation.operation,
          expectedVersion: mutation.expectedVersion,
          newVersion: mutation.newVersion,
          payloadHash: mutation.payloadHash,
          audiences: mutation.audiences,
        });
        const writing = await encryptPending({
          phase: 'writing',
          mutation,
          authControllerToken: createAuthControllerToken({
            sub: 'profile-1',
            exp: unixNow() + 60,
            requestHash: mutation.requestHash,
            aal: 2,
            identifiersHash: await hash(payload.identifiers),
          }),
          approvedIdentifiers: IDENTIFIERS,
          payload,
          identifier: null,
          receipts: [
            {
              mutationId: '0xmut',
              requestHash: mutation.requestHash,
              escrowId: 'escrow-z',
              version: 1,
              receiptKeyId: '0xreceipt',
              signature: '0x',
            },
          ],
        });
        const controller = new MfaRecoveryController({
          ...options,
          messenger: getMessenger(getRootMessenger(options.authProvider)),
          state: {
            pendingOperation: writing,
          },
        });
        await expect(controller.resume()).rejects.toThrow(
          'Receipt escrow is not configured',
        );
      });
    });

    it('rejects an invalid persisted receipt', async () => {
      await withController(async ({ options, escrowA }) => {
        escrowA.invalidReceipts = true;
        const payload = {
          identifiers: IDENTIFIERS,
          recoverySecret: bytesToHex(SECRET),
        };
        const payloadHash = await hash(payload);
        const mutation = {
          id: '0xmut',
          profileId: 'profile-1',
          operation: 'register' as const,
          expectedVersion: 0,
          newVersion: 1,
          payloadHash,
          audiences: ['escrow-a', 'escrow-b'],
          requestHash: '',
        };
        mutation.requestHash = await hash({
          id: mutation.id,
          profileId: mutation.profileId,
          operation: mutation.operation,
          expectedVersion: mutation.expectedVersion,
          newVersion: mutation.newVersion,
          payloadHash: mutation.payloadHash,
          audiences: mutation.audiences,
        });
        const writing = await encryptPending({
          phase: 'writing',
          mutation,
          authControllerToken: createAuthControllerToken({
            sub: 'profile-1',
            exp: unixNow() + 60,
            requestHash: mutation.requestHash,
            aal: 2,
            identifiersHash: await hash(payload.identifiers),
          }),
          approvedIdentifiers: IDENTIFIERS,
          payload,
          identifier: null,
          receipts: [
            {
              mutationId: '0xmut',
              requestHash: mutation.requestHash,
              escrowId: 'escrow-a',
              version: 1,
              receiptKeyId: '0xreceipt',
              signature: '0x',
            },
          ],
        });
        const controller = new MfaRecoveryController({
          ...options,
          messenger: getMessenger(getRootMessenger(options.authProvider)),
          state: {
            pendingOperation: writing,
          },
        });
        await expect(controller.resume()).rejects.toThrow(
          'Invalid mutation receipt',
        );
      });
    });

    it('rejects a newly issued invalid receipt', async () => {
      await withController(async ({ controller, escrowA }) => {
        escrowA.invalidReceipts = true;
        await expect(controller.register(SECRET, IDENTIFIERS)).rejects.toThrow(
          'Invalid mutation receipt',
        );
      });
    });

    it('persists valid receipts before reporting an invalid receipt', async () => {
      await withController(async ({ controller, escrowA, escrowB }) => {
        escrowA.invalidReceipts = true;

        await expect(controller.register(SECRET, IDENTIFIERS)).rejects.toThrow(
          'Invalid mutation receipt',
        );

        const pending = (await decryptPending(
          controller.state.pendingOperation as string,
        )) as {
          receipts: { escrowId: string }[];
        };
        expect(pending.receipts).toStrictEqual([
          expect.objectContaining({ escrowId: 'escrow-b' }),
        ]);
        expect(await escrowB.getRecoveryMetadata('profile-1')).toStrictEqual({
          version: 1,
          lastMutationId: expect.any(String) as string,
        });
      });
    });

    it('rejects a receipt whose escrow id does not match its target', async () => {
      await withController(async ({ controller, escrowA }) => {
        vi.spyOn(escrowA, 'applyMutation').mockResolvedValue({
          mutationId: '0xmutation',
          requestHash: '0xrequest',
          escrowId: 'escrow-z',
          version: 1,
          receiptKeyId: '0xreceipt',
          signature: '0xsignature',
        });
        vi.spyOn(escrowA, 'verifyReceipt').mockResolvedValue(true);

        await expect(controller.register(SECRET, IDENTIFIERS)).rejects.toThrow(
          'Invalid mutation receipt',
        );
      });
    });

    it('treats receipt verification errors as invalid receipts', async () => {
      await withController(async ({ controller, escrowA }) => {
        vi.spyOn(escrowA, 'verifyReceipt').mockRejectedValue(
          new Error('verification failed'),
        );

        await expect(controller.register(SECRET, IDENTIFIERS)).rejects.toThrow(
          'Invalid mutation receipt',
        );
      });
    });

    it('refreshes an expired AuthController token while resuming', async () => {
      await withController(async ({ controller, escrowA, options }) => {
        await controller.register(SECRET, IDENTIFIERS);
        escrowA.failNextApplyCount = 1;
        await expect(
          controller.updateRecoverySecret(PASSKEY, SECRET_2, REGISTERED_EPOCH),
        ).rejects.toBeInstanceOf(IncompleteMutationError);
        const pending = (await decryptPending(
          controller.state.pendingOperation as string,
        )) as {
          mutation: { requestHash: string };
          authControllerToken: string;
        };
        pending.authControllerToken = createAuthControllerToken({
          sub: 'profile-1',
          exp: 0,
          requestHash: pending.mutation.requestHash,
          aal: 2,
        });
        const resumed = new MfaRecoveryController({
          ...options,
          messenger: getMessenger(getRootMessenger(options.authProvider)),
          state: {
            pendingOperation: await encryptPending(pending),
          },
        });
        options.authProvider.identifiers = [...IDENTIFIERS, OTHER_PASSKEY];
        const apply = vi.spyOn(escrowA, 'applyMutation');
        await resumed.resume();
        expect(apply.mock.calls[0][4]).toStrictEqual(
          options.authProvider.identifiers,
        );
        expect(await resumed.getPhase()).toBe('idle');
      });
    });

    it('rejects a null decrypted pending operation before external calls', async () => {
      await withController(async ({ escrowA, escrowB, options }) => {
        const auth = vi.spyOn(options.authProvider, 'requestMfaApproval');
        const availabilityA = vi.spyOn(escrowA, 'isAvailable');
        const availabilityB = vi.spyOn(escrowB, 'isAvailable');
        const controller = new MfaRecoveryController({
          ...options,
          messenger: getMessenger(getRootMessenger(options.authProvider)),
          state: {
            pendingOperation: await encryptPending(null),
          },
        });

        await expect(controller.resume()).rejects.toThrow(
          'Invalid pending operation',
        );

        expect(auth).not.toHaveBeenCalled();
        expect(availabilityA).not.toHaveBeenCalled();
        expect(availabilityB).not.toHaveBeenCalled();
      });
    });

    it.each([
      {
        name: 'an invalid phase',
        mutate: async (pending: Record<string, unknown>): Promise<void> => {
          pending.phase = 'invalid';
        },
      },
      {
        name: 'a malformed mutation',
        mutate: async (pending: Record<string, unknown>): Promise<void> => {
          pending.mutation = null;
        },
      },
      {
        name: 'an operation and payload mismatch',
        mutate: async (pending: Record<string, unknown>): Promise<void> => {
          const mutation = pending.mutation as Record<string, unknown>;
          mutation.operation = 'updateIdentifiers';
          pending.payload = { recoverySecret: bytesToHex(SECRET) };
        },
      },
      {
        name: 'a malformed payload',
        mutate: async (pending: Record<string, unknown>): Promise<void> => {
          pending.payload = null;
        },
      },
      {
        name: 'a payload without a recovery secret',
        mutate: async (pending: Record<string, unknown>): Promise<void> => {
          pending.payload = {};
        },
      },
      {
        name: 'an invalid recovery secret encoding',
        mutate: async (pending: Record<string, unknown>): Promise<void> => {
          pending.payload = {
            recoverySecret: '0xzz',
          };
        },
      },
      {
        name: 'an identifier payload with invalid entries',
        mutate: async (pending: Record<string, unknown>): Promise<void> => {
          const mutation = pending.mutation as Record<string, unknown>;
          mutation.operation = 'updateIdentifiers';
          pending.payload = { identifiers: [{}] };
        },
      },
      {
        name: 'duplicate identifiers',
        mutate: async (pending: Record<string, unknown>): Promise<void> => {
          const mutation = pending.mutation as Record<string, unknown>;
          const payload = { identifiers: [PASSKEY, PASSKEY] };
          const payloadHash = await hash(payload);
          const fields = {
            id: mutation.id,
            profileId: mutation.profileId,
            operation: 'updateIdentifiers',
            expectedVersion: mutation.expectedVersion,
            newVersion: mutation.newVersion,
            payloadHash,
            audiences: mutation.audiences,
          };
          pending.mutation = {
            ...fields,
            requestHash: await hash(fields),
          };
          pending.payload = payload;
          pending.authControllerToken = createAuthControllerToken({
            sub: 'profile-1',
            exp: unixNow() + 60,
            requestHash: await hash(fields),
            identifiersHash: await hash(payload.identifiers),
          });
        },
      },
      {
        name: 'a non-null register identifier',
        mutate: async (pending: Record<string, unknown>): Promise<void> => {
          const mutation = pending.mutation as Record<string, unknown>;
          mutation.operation = 'register';
          pending.payload = {
            recoverySecret: bytesToHex(SECRET),
            identifiers: [PASSKEY],
          };
          pending.identifier = PASSKEY;
        },
      },
      {
        name: 'a non-zero register expectedVersion',
        mutate: async (pending: Record<string, unknown>): Promise<void> => {
          const mutation = pending.mutation as Record<string, unknown>;
          mutation.operation = 'register';
          mutation.expectedVersion = 1;
          mutation.newVersion = 2;
          pending.identifier = null;
          pending.payload = {
            identifiers: IDENTIFIERS,
            recoverySecret: bytesToHex(SECRET),
          };
        },
      },
      {
        name: 'a null update identifier',
        mutate: async (pending: Record<string, unknown>): Promise<void> => {
          pending.identifier = null;
        },
      },
      {
        name: 'an unknown identifier type',
        mutate: async (pending: Record<string, unknown>): Promise<void> => {
          pending.identifier = {
            type: 'unknown',
            namespace: 'example.com',
            value: 'unknown',
            verifier: null,
          };
        },
      },
      {
        name: 'a non-consecutive version',
        mutate: async (pending: Record<string, unknown>): Promise<void> => {
          const mutation = pending.mutation as Record<string, unknown>;
          mutation.expectedVersion = 4;
          mutation.newVersion = 6;
        },
      },
      {
        name: 'a mismatched payload hash',
        mutate: async (pending: Record<string, unknown>): Promise<void> => {
          const mutation = pending.mutation as Record<string, unknown>;
          mutation.payloadHash = '0xwrong-payload-hash';
        },
      },
      {
        name: 'a mismatched mutation request hash',
        mutate: async (pending: Record<string, unknown>): Promise<void> => {
          const mutation = pending.mutation as Record<string, unknown>;
          mutation.requestHash = '0xwrong-request-hash';
        },
      },
      {
        name: 'an out-of-order audience list',
        mutate: async (pending: Record<string, unknown>): Promise<void> => {
          const mutation = pending.mutation as Record<string, unknown>;
          mutation.audiences = ['escrow-b', 'escrow-a'];
        },
      },
      {
        name: 'an invalid AuthController token',
        mutate: async (pending: Record<string, unknown>): Promise<void> => {
          pending.authControllerToken = createAuthControllerToken({
            sub: 'profile-1',
            exp: unixNow() + 60,
            requestHash: '0xwrong-token-request-hash',
            aal: 2,
          });
        },
      },
      {
        name: 'a malformed AuthController token',
        mutate: async (pending: Record<string, unknown>): Promise<void> => {
          pending.authControllerToken = null;
        },
      },
      {
        name: 'an AuthController token with invalid fields',
        mutate: async (pending: Record<string, unknown>): Promise<void> => {
          pending.authControllerToken = {};
        },
      },
      {
        name: 'an AuthController token without step-up assurance',
        mutate: async (pending: Record<string, unknown>): Promise<void> => {
          const mutation = pending.mutation as Record<string, unknown>;
          pending.authControllerToken = createAuthControllerToken({
            sub: 'profile-1',
            exp: unixNow() + 60,
            requestHash: mutation.requestHash as string,
          });
        },
      },
      {
        name: 'malformed approved identifiers',
        mutate: async (pending: Record<string, unknown>): Promise<void> => {
          pending.approvedIdentifiers = [{}];
        },
      },
      {
        name: 'an invalid receipt array',
        mutate: async (pending: Record<string, unknown>): Promise<void> => {
          pending.receipts = null;
        },
      },
      {
        name: 'a receipt with invalid fields',
        mutate: async (pending: Record<string, unknown>): Promise<void> => {
          pending.receipts = [{}];
        },
      },
      {
        name: 'duplicate receipts',
        mutate: async (pending: Record<string, unknown>): Promise<void> => {
          const mutation = pending.mutation as Record<string, unknown>;
          const receipt = {
            mutationId: mutation.id,
            requestHash: mutation.requestHash,
            escrowId: 'escrow-a',
            version: mutation.newVersion,
            receiptKeyId: '0xreceipt',
            signature: '0xsignature',
          };
          pending.receipts = [receipt, receipt];
        },
      },
    ])(
      'rejects persisted state with $name before external calls',
      async ({ mutate }) => {
        await withController(async ({ escrowA, escrowB, options }) => {
          const pending = JSON.parse(
            JSON.stringify(await getValidWritingPending(options.escrows)),
          ) as Record<string, unknown>;
          await mutate(pending);
          const auth = vi.spyOn(options.authProvider, 'requestMfaApproval');
          const availabilityA = vi.spyOn(escrowA, 'isAvailable');
          const availabilityB = vi.spyOn(escrowB, 'isAvailable');
          const applyA = vi.spyOn(escrowA, 'applyMutation');
          const applyB = vi.spyOn(escrowB, 'applyMutation');
          const controller = new MfaRecoveryController({
            ...options,
            messenger: getMessenger(getRootMessenger(options.authProvider)),
            state: {
              pendingOperation: await encryptPending(pending),
            },
          });

          await expect(controller.resume()).rejects.toThrow(/./u);

          expect(auth).not.toHaveBeenCalled();
          expect(availabilityA).not.toHaveBeenCalled();
          expect(availabilityB).not.toHaveBeenCalled();
          expect(applyA).not.toHaveBeenCalled();
          expect(applyB).not.toHaveBeenCalled();
        });
      },
    );
  });

  describe('identifier registry', () => {
    it('rejects unknown identifier types', async () => {
      await withController(async ({ controller }) => {
        await expect(
          controller.register(SECRET, [
            { type: 'unknown', namespace: 'x', value: 'y', verifier: null },
            PASSKEY,
          ]),
        ).rejects.toThrow('Unknown identifier type');
      });
    });

    it.each(['emailOtp', 'smsOtp'])(
      'rejects %s until escrow-challenge OTP is implemented',
      async (type) => {
        await withController(async ({ controller }) => {
          await expect(
            controller.register(SECRET, [
              { type, namespace: 'x', value: 'y', verifier: null },
              PASSKEY,
            ]),
          ).rejects.toThrow('Unknown identifier type');
        });
      },
    );

    it.each([
      { ...WALLET, namespace: 'example.com:2' },
      { ...WALLET, verifier: undefined },
      ...[
        {},
        { domain: 1, chainId: 1 },
        { domain: '', chainId: 1 },
        { domain: 'example.com' },
        { domain: 'example.com', chainId: '1' },
        { domain: 'example.com', chainId: -1 },
        { domain: 'example.com', chainId: 1.5 },
        { domain: 'example.com', chainId: NaN },
        { domain: 'example.com', chainId: Infinity },
        { domain: 'example.com', chainId: Number.MAX_SAFE_INTEGER + 1 },
      ].map((verifier) => ({
        ...WALLET,
        verifier,
        namespace: `${String(verifier.domain)}:${String(verifier.chainId)}`,
      })),
    ])(
      'rejects a SIWE identifier with an invalid verifier or namespace',
      async (wallet) => {
        await withController(async ({ controller, authProvider }) => {
          const authorize = vi.spyOn(authProvider, 'requestMfaApproval');
          await expect(
            controller.register(SECRET, [PASSKEY, wallet]),
          ).rejects.toMatchObject({ code: 'invalid_identifier' });
          await expect(
            controller.updateIdentifiers(PASSKEY, [PASSKEY, wallet], 0),
          ).rejects.toMatchObject({ code: 'invalid_identifier' });
          expect(authorize).not.toHaveBeenCalled();
          expect(controller.state.pendingOperation).toBeNull();
        });
      },
    );

    it.each([
      { domain: 'localhost:3010', chainId: 1 },
      { domain: 'example.com', chainId: 0 },
      { domain: 'example.com', chainId: Number.MAX_SAFE_INTEGER },
    ])('accepts valid SIWE verifier %j', async (verifier) => {
      await withController(async ({ controller }) => {
        const wallet = {
          ...WALLET,
          verifier,
          namespace: `${verifier.domain}:${verifier.chainId}`,
        };
        expect(
          await controller.register(SECRET, [PASSKEY, wallet]),
        ).toBeUndefined();
      });
    });
  });

  describe('pending state encryption', () => {
    it('encrypts pending state with the host-provided key and fetches it once', async () => {
      await withController(async ({ escrowA, options }) => {
        const encryptor = getSpyEncryptor();
        const getPendingOperationKey = vi.fn(getStubPendingOperationKey);
        const controller = new MfaRecoveryController({
          ...options,
          messenger: getMessenger(getRootMessenger(options.authProvider)),
          encryptor,
          getPendingOperationKey,
        });
        escrowA.failNextApplyCount = 1;
        await expect(
          controller.register(SECRET, IDENTIFIERS),
        ).rejects.toBeInstanceOf(IncompleteMutationError);

        expect(
          JSON.parse(controller.state.pendingOperation as string),
        ).toMatchObject({ iv: STUB_ENCRYPTION_KEY });

        await controller.resume();
        await controller.updateRecoverySecret(
          PASSKEY,
          SECRET_2,
          REGISTERED_EPOCH,
        );
        expect(controller.state).toStrictEqual({ pendingOperation: null });
        expect(getPendingOperationKey).toHaveBeenCalledTimes(1);
        expect(encryptor.importKey).toHaveBeenCalledTimes(1);
        expect(encryptor.importKey).toHaveBeenCalledWith(STUB_ENCRYPTION_KEY);
      });
    });

    it('reads persisted pending state with the host-provided key', async () => {
      await withController(async ({ controller, escrowA, options }) => {
        escrowA.failNextApplyCount = 1;
        await expect(
          controller.register(SECRET, IDENTIFIERS),
        ).rejects.toBeInstanceOf(IncompleteMutationError);

        const restored = new MfaRecoveryController({
          ...options,
          messenger: getMessenger(getRootMessenger(options.authProvider)),
          state: controller.state,
        });

        expect(await restored.getPhase()).toBe('writing');
        await restored.resume();
        expect(await restored.getPhase()).toBe('idle');
      });
    });

    it.each([null, ''])(
      'rejects with missing_encryption_key when the host returns %j',
      async (missingKey) => {
        await withController(async ({ escrowA, escrowB, options }) => {
          const getPendingOperationKey = vi.fn(
            async (): Promise<string | null> => missingKey,
          );
          const state = {
            pendingOperation: await encryptPending(
              await getValidWritingPending([escrowA, escrowB]),
            ),
          };
          const controller = new MfaRecoveryController({
            ...options,
            messenger: getMessenger(getRootMessenger(options.authProvider)),
            getPendingOperationKey,
            state,
          });
          const apply = vi.spyOn(escrowA, 'applyMutation');

          await expect(controller.getPhase()).rejects.toMatchObject({
            code: 'missing_encryption_key',
          });
          await expect(controller.resume()).rejects.toMatchObject({
            code: 'missing_encryption_key',
          });
          await expect(controller.abort()).rejects.toMatchObject({
            code: 'missing_encryption_key',
          });
          expect(apply).not.toHaveBeenCalled();
          expect(controller.state).toStrictEqual(state);
        });
      },
    );

    it('does not start a mutation when the host has no key', async () => {
      await withController(async ({ escrowA, options }) => {
        const controller = new MfaRecoveryController({
          ...options,
          messenger: getMessenger(getRootMessenger(options.authProvider)),
          getPendingOperationKey: async (): Promise<string | null> => null,
        });
        const apply = vi.spyOn(escrowA, 'applyMutation');

        await expect(
          controller.register(SECRET, IDENTIFIERS),
        ).rejects.toMatchObject({ code: 'missing_encryption_key' });
        expect(apply).not.toHaveBeenCalled();
        expect(controller.state).toStrictEqual({ pendingOperation: null });
      });
    });

    it('cannot read pending state written under a different key', async () => {
      await withController(async ({ controller, escrowA, options }) => {
        escrowA.failNextApplyCount = 1;
        await expect(
          controller.register(SECRET, IDENTIFIERS),
        ).rejects.toBeInstanceOf(IncompleteMutationError);

        const rekeyed = new MfaRecoveryController({
          ...options,
          messenger: getMessenger(getRootMessenger(options.authProvider)),
          getPendingOperationKey: async (): Promise<string | null> =>
            'other-key',
          state: controller.state,
        });

        await expect(rekeyed.getPhase()).rejects.toThrow('Incorrect key');
        await expect(rekeyed.resume()).rejects.toThrow('Incorrect key');
        expect(rekeyed.state).toStrictEqual(controller.state);
      });
    });

    it('fetches the key once for concurrent first use', async () => {
      await withController(async ({ options }) => {
        const getPendingOperationKey = vi.fn(getStubPendingOperationKey);
        const controller = new MfaRecoveryController({
          ...options,
          messenger: getMessenger(getRootMessenger(options.authProvider)),
          getPendingOperationKey,
        });

        const results = await Promise.allSettled([
          controller.register(SECRET, IDENTIFIERS),
          controller.register(SECRET, IDENTIFIERS),
        ]);

        expect(results[0].status).toBe('fulfilled');
        expect(getPendingOperationKey).toHaveBeenCalledTimes(1);
      });
    });

    it('fetches the key again after the host fails', async () => {
      await withController(async ({ escrowA, options }) => {
        const getPendingOperationKey = vi
          .fn<() => Promise<string | null>>()
          .mockRejectedValueOnce(new Error('Secure storage unavailable'))
          .mockResolvedValue(STUB_ENCRYPTION_KEY);
        const controller = new MfaRecoveryController({
          ...options,
          messenger: getMessenger(getRootMessenger(options.authProvider)),
          getPendingOperationKey,
        });
        const apply = vi.spyOn(escrowA, 'applyMutation');

        await expect(controller.register(SECRET, IDENTIFIERS)).rejects.toThrow(
          'Secure storage unavailable',
        );
        expect(apply).not.toHaveBeenCalled();
        expect(controller.state).toStrictEqual({ pendingOperation: null });

        await controller.register(SECRET, IDENTIFIERS);
        expect(getPendingOperationKey).toHaveBeenCalledTimes(2);
      });
    });
  });
});

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<MfaRecoveryControllerMessenger>,
  MessengerEvents<MfaRecoveryControllerMessenger>
>;

type TestController = MfaRecoveryController<string>;

type WithControllerCallback<ReturnValue> = (payload: {
  controller: TestController;
  authProvider: StubAuthProvider;
  rootMessenger: RootMessenger;
  controllerMessenger: MfaRecoveryControllerMessenger;
  escrowA: StubEscrowProvider;
  escrowB: StubEscrowProvider;
  options: ReturnType<typeof getOptions>;
}) => Promise<ReturnValue> | ReturnValue;

function getSpyEncryptor(): {
  [Method in keyof typeof stubEncryptor]: Mock<(typeof stubEncryptor)[Method]>;
} {
  return {
    importKey: vi.fn(stubEncryptor.importKey),
    encryptWithKey: vi.fn(stubEncryptor.encryptWithKey),
    decryptWithKey: vi.fn(stubEncryptor.decryptWithKey),
  };
}

function getRootMessenger(
  authProvider = new StubAuthProvider(IDENTIFIERS),
): RootMessenger {
  const rootMessenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });
  rootMessenger.registerActionHandler(
    'AuthenticationController:refreshCanonicalProfileId',
    async () => await authProvider.refreshCanonicalProfileId(),
  );
  rootMessenger.registerActionHandler(
    'AuthenticationController:requestMfaApproval',
    async (request) => await authProvider.requestMfaApproval(request),
  );
  return rootMessenger;
}

function getMessenger(
  rootMessenger: RootMessenger,
): MfaRecoveryControllerMessenger {
  const messenger: MfaRecoveryControllerMessenger = new Messenger({
    namespace: 'MfaRecoveryController',
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    messenger,
    actions: [
      'AuthenticationController:refreshCanonicalProfileId',
      'AuthenticationController:requestMfaApproval',
    ],
  });
  return messenger;
}

function getOptions(
  escrowA: StubEscrowProvider,
  escrowB: StubEscrowProvider,
): MfaRecoveryControllerOptions<string> & {
  authProvider: StubAuthProvider;
} {
  const authProvider = new StubAuthProvider(IDENTIFIERS);
  return {
    messenger: getMessenger(getRootMessenger(authProvider)),
    authProvider,
    identifierAuthProvider: new StubIdentifierAuthProvider(),
    escrows: [escrowA, escrowB],
    encryptor: stubEncryptor,
    getPendingOperationKey: getStubPendingOperationKey,
  };
}

async function recover(
  controller: TestController,
  identifier: Identifier,
): Promise<RecoveredSecret> {
  return await controller.getRecoverySecret(
    await controller.authenticateIdentifier(identifier),
  );
}

async function getValidWritingPending(
  escrows: RecoveryEscrowProvider[],
  expectedVersion = 1,
): Promise<WritingPendingOperation> {
  const payload = {
    recoverySecret: bytesToHex(SECRET_2),
  };
  const payloadHash = await hash(payload);
  const fields = {
    id: '0xvalid-pending',
    profileId: 'profile-1',
    operation: 'updateRecoverySecret' as const,
    expectedVersion,
    newVersion: expectedVersion + 1,
    payloadHash,
    audiences: escrows.map((escrow) => escrow.id),
  };
  return {
    phase: 'writing',
    mutation: {
      ...fields,
      requestHash: await hash(fields),
    },
    authControllerToken: createAuthControllerToken({
      sub: 'profile-1',
      exp: unixNow() + 60,
      requestHash: await hash(fields),
      aal: 2,
    }),
    approvedIdentifiers: IDENTIFIERS,
    payload,
    identifier: PASSKEY,
    receipts: [],
  };
}

async function withController<ReturnValue>(
  testFunction: WithControllerCallback<ReturnValue>,
): Promise<ReturnValue> {
  const replicaIds = ['escrow-a', 'escrow-b'];
  const escrowA = new StubEscrowProvider(
    'escrow-a',
    await generateWrapKey(),
    await generateSigningKey(),
    replicaIds,
  );
  const escrowB = new StubEscrowProvider(
    'escrow-b',
    await generateWrapKey(),
    await generateSigningKey(),
    replicaIds,
  );
  const baseOptions = getOptions(escrowA, escrowB);
  const rootMessenger = getRootMessenger(baseOptions.authProvider);
  const controllerMessenger = getMessenger(rootMessenger);
  const options = { ...baseOptions, messenger: controllerMessenger };
  const controller = new MfaRecoveryController(options);
  return await testFunction({
    controller,
    authProvider: options.authProvider,
    rootMessenger,
    controllerMessenger,
    escrowA,
    escrowB,
    options,
  });
}
