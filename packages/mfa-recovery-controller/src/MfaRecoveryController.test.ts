import { deriveStateFromMetadata } from '@metamask/base-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import { bytesToBase64, bytesToHex, stringToBytes } from '@metamask/utils';

import {
  HangSwitch,
  StubAuthProvider,
  StubEscrowProvider,
  StubIdentifierAuthProvider,
  createAuthControllerToken,
  passthroughEncryptor,
} from '../tests/stubs.js';
import {
  canonicalizeIdentifiers,
  generateSigningKey,
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

const OIDC: Identifier = {
  type: 'oidc',
  namespace: 'https://accounts.google.com',
  value: 'sub-1',
  verifier: { auds: ['client'] },
};

const IDENTIFIERS = [PASSKEY, OIDC];

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
            authProvider: new StubAuthProvider(),
            identifierAuthProvider: new StubIdentifierAuthProvider(),
            escrows: [],
            pendingOperationEncryptor: passthroughEncryptor,
          }),
      ).toThrow('At least one escrow is required');
    });

    it('throws if escrow ids are duplicated', () => {
      const rootMessenger = getRootMessenger();
      expect(
        () =>
          new MfaRecoveryController({
            messenger: getMessenger(rootMessenger),
            authProvider: new StubAuthProvider(),
            identifierAuthProvider: new StubIdentifierAuthProvider(),
            escrows: [
              new StubEscrowProvider('escrow-a'),
              new StubEscrowProvider('escrow-a'),
            ],
            pendingOperationEncryptor: passthroughEncryptor,
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
        const verifyReceipt = jest.spyOn(escrowA, 'verifyReceipt');
        const applyA = jest.spyOn(escrowA, 'applyMutation');
        const applyB = jest.spyOn(escrowB, 'applyMutation');
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

    it('publishes state changes through the stateChanged event', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        const listener = jest.fn();
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
      const escrowA = new StubEscrowProvider('escrow-a');
      const escrowB = new StubEscrowProvider('escrow-b', {
        publicKey: '{}',
        privateKey: '{}',
      });
      const applyA = jest.spyOn(escrowA, 'applyMutation');
      const applyB = jest.spyOn(escrowB, 'applyMutation');
      const controller = new MfaRecoveryController({
        ...getOptions(escrowA, escrowB),
        messenger: getMessenger(getRootMessenger()),
      });

      await expect(controller.register(SECRET, IDENTIFIERS)).rejects.toThrow(
        'Invalid P-256 public JWK',
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
          hash({
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
        ): IdentifierSession => ({
          ...session,
          pkE: { ...session.pkE, x: `${session.pkE.x}-tampered` },
        }),
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
        const getToken = jest.spyOn(
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

    it('continues reading when an escrow availability check fails', async () => {
      await withController(async ({ controller, escrowA }) => {
        await controller.register(SECRET, IDENTIFIERS);
        jest
          .spyOn(escrowA, 'isAvailable')
          .mockRejectedValue(new Error('health check failed'));

        const recovered = await recover(controller, PASSKEY);

        expect(bytesToHex(recovered.recoverySecret)).toBe(bytesToHex(SECRET));
      });
    });

    it('continues reading when key-bound authorization fails for one escrow', async () => {
      await withController(async ({ controller, escrowA }) => {
        await controller.register(SECRET, IDENTIFIERS);
        jest
          .spyOn(escrowA, 'generateChallenge')
          .mockRejectedValue(new Error('challenge failed'));

        const recovered = await recover(controller, PASSKEY);

        expect(bytesToHex(recovered.recoverySecret)).toBe(bytesToHex(SECRET));
      });
    });

    it('continues reading when an escrow returns an unexpected wrap key id', async () => {
      await withController(async ({ controller, escrowA }) => {
        await controller.register(SECRET, IDENTIFIERS);
        jest.spyOn(escrowA, 'getSecret').mockResolvedValue({
          recoverySecret: { ciphertext: 'aa' },
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
            lastMutationId: expect.any(String),
          });
          expect(await escrowB.getRecoveryMetadata('profile-1')).toStrictEqual({
            version: 1,
            lastMutationId: expect.any(String),
          });
        },
      );
    });
  });

  describe('updateRecoverySecret', () => {
    it('replaces the secret at every escrow', async () => {
      await withController(async ({ controller, escrowA }) => {
        const generateChallenge = jest.spyOn(escrowA, 'generateChallenge');
        await controller.register(SECRET, IDENTIFIERS);
        await controller.updateRecoverySecret(
          PASSKEY,
          SECRET_2,
          REGISTERED_EPOCH,
        );
        expect(generateChallenge).toHaveBeenCalled();
        expect(escrowA.lastGenerateChallengeSignal).toBeInstanceOf(AbortSignal);
        const recovered = await recover(controller, PASSKEY);
        expect(bytesToHex(recovered.recoverySecret)).toBe(bytesToHex(SECRET_2));
      });
    });

    it('throws when a configured escrow is unavailable', async () => {
      await withController(async ({ controller, escrowB }) => {
        await controller.register(SECRET, IDENTIFIERS);
        escrowB.available = false;
        await expect(
          controller.updateRecoverySecret(PASSKEY, SECRET_2, REGISTERED_EPOCH),
        ).rejects.toThrow('All configured escrows are required for mutation');
        expect(await controller.getPhase()).toBe('authorizing');
        await controller.abort();
      });
    });

    it('does not write when one escrow cannot be authorized', async () => {
      await withController(async ({ controller, escrowA, escrowB }) => {
        await controller.register(SECRET, IDENTIFIERS);
        jest
          .spyOn(escrowA, 'generateChallenge')
          .mockRejectedValue(new Error('challenge failed'));
        const applyA = jest.spyOn(escrowA, 'applyMutation');
        const applyB = jest.spyOn(escrowB, 'applyMutation');

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
        jest.spyOn(escrowA, 'applyMutation').mockImplementation(async () => {
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
          JSON.parse(controller.state.pendingOperation as string),
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
      await withController(async ({ controller, escrowA }) => {
        await controller.register(SECRET, IDENTIFIERS);
        escrowA.failNextApplyCount = 1;
        await expect(
          controller.updateRecoverySecret(PASSKEY, SECRET_2, REGISTERED_EPOCH),
        ).rejects.toBeInstanceOf(IncompleteMutationError);
        expect(await controller.getPhase()).toBe('writing');
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

  describe('updateIdentifiers', () => {
    it('replaces the identifier set', async () => {
      await withController(async ({ controller }) => {
        await controller.register(SECRET, IDENTIFIERS);
        await controller.updateIdentifiers(
          PASSKEY,
          [OIDC, PASSKEY],
          REGISTERED_EPOCH,
        );
        const recovered = await recover(controller, OIDC);
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
            messenger: getMessenger(getRootMessenger()),
            state: {
              pendingOperation: await passthroughEncryptor.encrypt(pending),
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
        const encrypted = await passthroughEncryptor.encrypt(pending);
        const availabilityA = jest.spyOn(escrowA, 'isAvailable');
        const availabilityB = jest.spyOn(escrowB, 'isAvailable');
        availabilityA.mockClear();
        availabilityB.mockClear();
        escrowA.available = false;
        escrowB.available = false;

        const resumed = new MfaRecoveryController({
          ...getOptions(escrowA, escrowB),
          messenger: getMessenger(getRootMessenger()),
          state: { pendingOperation: encrypted },
        });

        await resumed.resume();

        expect(await resumed.getPhase()).toBe('idle');
        expect(availabilityA).not.toHaveBeenCalled();
        expect(availabilityB).not.toHaveBeenCalled();
      });
    });

    it('aborts an authorizing mutation and refuses to abort writing', async () => {
      await withController(async ({ options }) => {
        const validPending = await getValidWritingPending(options.escrows);
        const authorizing = await passthroughEncryptor.encrypt({
          phase: 'authorizing',
          mutation: validPending.mutation,
          payload: validPending.payload,
          identifier: validPending.identifier,
        });
        const authorizingMessenger = getMessenger(getRootMessenger());
        const idleController = new MfaRecoveryController({
          ...options,
          messenger: authorizingMessenger,
          state: { pendingOperation: authorizing },
        });
        expect(await idleController.getPhase()).toBe('authorizing');
        await idleController.abort();
        expect(await idleController.getPhase()).toBe('idle');

        const writing = await passthroughEncryptor.encrypt({
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
        const writingMessenger = getMessenger(getRootMessenger());
        const writingController = new MfaRecoveryController({
          ...options,
          messenger: writingMessenger,
          state: { pendingOperation: writing },
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
        const payloadHash = hash(payload);
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
          requestHash: hash(fields),
        };
        const authorizing = await passthroughEncryptor.encrypt({
          phase: 'authorizing',
          mutation,
          payload,
          identifier: null,
        });
        const controller = new MfaRecoveryController({
          ...options,
          messenger: getMessenger(getRootMessenger()),
          state: { pendingOperation: authorizing },
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
        const payloadHash = hash(payload);
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
          requestHash: hash(mutationFields),
        };
        const authorizing = {
          phase: 'authorizing' as const,
          mutation,
          payload,
          identifier: PASSKEY,
        };
        const resumed = new MfaRecoveryController({
          ...options,
          messenger: getMessenger(getRootMessenger()),
          state: {
            pendingOperation: await passthroughEncryptor.encrypt(authorizing),
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
            payloadHash: hash(payload),
            audiences: ['escrow-a', 'escrow-b'],
            requestHash: '0x',
          };
          mutation.requestHash = hash({
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
          const writing = await passthroughEncryptor.encrypt({
            phase: 'writing',
            mutation,
            authControllerToken: createAuthControllerToken({
              sub: 'profile-1',
              exp: unixNow() + 60,
              requestHash: mutation.requestHash,
              aal: 2,
            }),
            payload,
            identifier: PASSKEY,
            receipts,
          });
          const resumed = new MfaRecoveryController({
            ...options,
            messenger: getMessenger(getRootMessenger()),
            state: { pendingOperation: writing },
          });
          await resumed.resume();
          expect(await resumed.getPhase()).toBe('idle');
        },
      );
    });

    it('rejects a persisted mutation with the wrong escrow audience', async () => {
      await withController(async ({ options }) => {
        const writing = await passthroughEncryptor.encrypt({
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
          messenger: getMessenger(getRootMessenger()),
          state: { pendingOperation: writing },
        });
        await expect(controller.resume()).rejects.toThrow(
          'Persisted mutation audiences do not match configured escrows',
        );
      });
    });

    it('rejects a pending payload that does not match the mutation hash', async () => {
      await withController(async ({ options }) => {
        const writing = await passthroughEncryptor.encrypt({
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
          payload: {
            recoverySecret: bytesToHex(SECRET),
            identifiers: IDENTIFIERS,
          },
          identifier: null,
          receipts: [],
        });
        const controller = new MfaRecoveryController({
          ...options,
          messenger: getMessenger(getRootMessenger()),
          state: { pendingOperation: writing },
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
        const payloadHash = hash(payload);
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
        mutation.requestHash = hash({
          id: mutation.id,
          profileId: mutation.profileId,
          operation: mutation.operation,
          expectedVersion: mutation.expectedVersion,
          newVersion: mutation.newVersion,
          payloadHash: mutation.payloadHash,
          audiences: mutation.audiences,
        });
        const writing = await passthroughEncryptor.encrypt({
          phase: 'writing',
          mutation,
          authControllerToken: createAuthControllerToken({
            sub: 'profile-1',
            exp: unixNow() + 60,
            requestHash: mutation.requestHash,
            identifiersHash: hash(canonicalizeIdentifiers(payload.identifiers)),
          }),
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
          messenger: getMessenger(getRootMessenger()),
          state: { pendingOperation: writing },
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
        const payloadHash = hash(payload);
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
        mutation.requestHash = hash({
          id: mutation.id,
          profileId: mutation.profileId,
          operation: mutation.operation,
          expectedVersion: mutation.expectedVersion,
          newVersion: mutation.newVersion,
          payloadHash: mutation.payloadHash,
          audiences: mutation.audiences,
        });
        const writing = await passthroughEncryptor.encrypt({
          phase: 'writing',
          mutation,
          authControllerToken: createAuthControllerToken({
            sub: 'profile-1',
            exp: unixNow() + 60,
            requestHash: mutation.requestHash,
            identifiersHash: hash(canonicalizeIdentifiers(payload.identifiers)),
          }),
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
          messenger: getMessenger(getRootMessenger()),
          state: { pendingOperation: writing },
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

        const pending = JSON.parse(
          controller.state.pendingOperation as string,
        ) as {
          receipts: { escrowId: string }[];
        };
        expect(pending.receipts).toStrictEqual([
          expect.objectContaining({ escrowId: 'escrow-b' }),
        ]);
        expect(await escrowB.getRecoveryMetadata('profile-1')).toStrictEqual({
          version: 1,
          lastMutationId: expect.any(String),
        });
      });
    });

    it('rejects a receipt whose escrow id does not match its target', async () => {
      await withController(async ({ controller, escrowA }) => {
        jest.spyOn(escrowA, 'applyMutation').mockResolvedValue({
          mutationId: '0xmutation',
          requestHash: '0xrequest',
          escrowId: 'escrow-z',
          version: 1,
          receiptKeyId: '0xreceipt',
          signature: '0xsignature',
        });
        jest.spyOn(escrowA, 'verifyReceipt').mockReturnValue(true);

        await expect(controller.register(SECRET, IDENTIFIERS)).rejects.toThrow(
          'Invalid mutation receipt',
        );
      });
    });

    it('treats receipt verification errors as invalid receipts', async () => {
      await withController(async ({ controller, escrowA }) => {
        jest.spyOn(escrowA, 'verifyReceipt').mockImplementation(() => {
          throw new Error('verification failed');
        });

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
        const pending = JSON.parse(
          controller.state.pendingOperation as string,
        ) as { mutation: { requestHash: string }; authControllerToken: string };
        pending.authControllerToken = createAuthControllerToken({
          sub: 'profile-1',
          exp: 0,
          requestHash: pending.mutation.requestHash,
          aal: 2,
        });
        const resumed = new MfaRecoveryController({
          ...options,
          messenger: getMessenger(getRootMessenger()),
          state: { pendingOperation: JSON.stringify(pending) },
        });
        await resumed.resume();
        expect(await resumed.getPhase()).toBe('idle');
      });
    });

    it('rejects a null decrypted pending operation before external calls', async () => {
      await withController(async ({ escrowA, escrowB, options }) => {
        const auth = jest.spyOn(
          options.authProvider,
          'authorizeRecoveryRequest',
        );
        const availabilityA = jest.spyOn(escrowA, 'isAvailable');
        const availabilityB = jest.spyOn(escrowB, 'isAvailable');
        const controller = new MfaRecoveryController({
          ...options,
          messenger: getMessenger(getRootMessenger()),
          state: { pendingOperation: 'null' },
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
        mutate: (pending: Record<string, unknown>): void => {
          pending.phase = 'invalid';
        },
      },
      {
        name: 'a malformed mutation',
        mutate: (pending: Record<string, unknown>): void => {
          pending.mutation = null;
        },
      },
      {
        name: 'an operation and payload mismatch',
        mutate: (pending: Record<string, unknown>): void => {
          const mutation = pending.mutation as Record<string, unknown>;
          mutation.operation = 'updateIdentifiers';
          pending.payload = { recoverySecret: bytesToHex(SECRET) };
        },
      },
      {
        name: 'a malformed payload',
        mutate: (pending: Record<string, unknown>): void => {
          pending.payload = null;
        },
      },
      {
        name: 'a payload without a recovery secret',
        mutate: (pending: Record<string, unknown>): void => {
          pending.payload = {};
        },
      },
      {
        name: 'an invalid recovery secret encoding',
        mutate: (pending: Record<string, unknown>): void => {
          pending.payload = {
            recoverySecret: '0xzz',
          };
        },
      },
      {
        name: 'an identifier payload with invalid entries',
        mutate: (pending: Record<string, unknown>): void => {
          const mutation = pending.mutation as Record<string, unknown>;
          mutation.operation = 'updateIdentifiers';
          pending.payload = { identifiers: [{}] };
        },
      },
      {
        name: 'duplicate identifiers',
        mutate: (pending: Record<string, unknown>): void => {
          const mutation = pending.mutation as Record<string, unknown>;
          const payload = { identifiers: [PASSKEY, PASSKEY] };
          const payloadHash = hash(payload);
          const fields = {
            id: mutation.id,
            profileId: mutation.profileId,
            operation: 'updateIdentifiers',
            expectedVersion: mutation.expectedVersion,
            newVersion: mutation.newVersion,
            payloadHash,
            audiences: mutation.audiences,
          };
          pending.mutation = { ...fields, requestHash: hash(fields) };
          pending.payload = payload;
          pending.authControllerToken = createAuthControllerToken({
            sub: 'profile-1',
            exp: unixNow() + 60,
            requestHash: hash(fields),
            identifiersHash: hash(payload.identifiers),
          });
        },
      },
      {
        name: 'a non-null register identifier',
        mutate: (pending: Record<string, unknown>): void => {
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
        mutate: (pending: Record<string, unknown>): void => {
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
        mutate: (pending: Record<string, unknown>): void => {
          pending.identifier = null;
        },
      },
      {
        name: 'an unknown identifier type',
        mutate: (pending: Record<string, unknown>): void => {
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
        mutate: (pending: Record<string, unknown>): void => {
          const mutation = pending.mutation as Record<string, unknown>;
          mutation.expectedVersion = 4;
          mutation.newVersion = 6;
        },
      },
      {
        name: 'a mismatched payload hash',
        mutate: (pending: Record<string, unknown>): void => {
          const mutation = pending.mutation as Record<string, unknown>;
          mutation.payloadHash = '0xwrong-payload-hash';
        },
      },
      {
        name: 'a mismatched mutation request hash',
        mutate: (pending: Record<string, unknown>): void => {
          const mutation = pending.mutation as Record<string, unknown>;
          mutation.requestHash = '0xwrong-request-hash';
        },
      },
      {
        name: 'an out-of-order audience list',
        mutate: (pending: Record<string, unknown>): void => {
          const mutation = pending.mutation as Record<string, unknown>;
          mutation.audiences = ['escrow-b', 'escrow-a'];
        },
      },
      {
        name: 'an invalid AuthController token',
        mutate: (pending: Record<string, unknown>): void => {
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
        mutate: (pending: Record<string, unknown>): void => {
          pending.authControllerToken = null;
        },
      },
      {
        name: 'an AuthController token with invalid fields',
        mutate: (pending: Record<string, unknown>): void => {
          pending.authControllerToken = {};
        },
      },
      {
        name: 'an invalid receipt array',
        mutate: (pending: Record<string, unknown>): void => {
          pending.receipts = null;
        },
      },
      {
        name: 'a receipt with invalid fields',
        mutate: (pending: Record<string, unknown>): void => {
          pending.receipts = [{}];
        },
      },
      {
        name: 'duplicate receipts',
        mutate: (pending: Record<string, unknown>): void => {
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
          mutate(pending);
          const auth = jest.spyOn(
            options.authProvider,
            'authorizeRecoveryRequest',
          );
          const availabilityA = jest.spyOn(escrowA, 'isAvailable');
          const availabilityB = jest.spyOn(escrowB, 'isAvailable');
          const applyA = jest.spyOn(escrowA, 'applyMutation');
          const applyB = jest.spyOn(escrowB, 'applyMutation');
          const controller = new MfaRecoveryController({
            ...options,
            messenger: getMessenger(getRootMessenger()),
            state: { pendingOperation: JSON.stringify(pending) },
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

    it.each([
      {
        name: 'is not a compact JWT',
        createToken: (): string => 'not-a-jwt',
      },
      {
        name: 'has claims without step-up bindings',
        createToken: (): string =>
          `${encodeJwtSegment({ alg: 'none' })}.${encodeJwtSegment({
            sub: 'profile-1',
            exp: unixNow() + 60,
          })}.stub-signature`,
      },
      {
        name: 'has a non-numeric assurance level',
        createToken: (requestHash: string): string =>
          createAuthControllerToken({
            sub: 'profile-1',
            exp: unixNow() + 60,
            requestHash,
            aal: '2' as unknown as number,
          }),
      },
      {
        name: 'has no assurance level for an update',
        createToken: (requestHash: string): string =>
          createAuthControllerToken({
            sub: 'profile-1',
            exp: unixNow() + 60,
            requestHash,
          }),
      },
    ])(
      'rejects a writing mutation whose AuthController token $name',
      async ({ createToken }) => {
        await withController(async ({ escrowA, escrowB, options }) => {
          const pending = await getValidWritingPending(options.escrows);
          pending.authControllerToken = createToken(
            pending.mutation.requestHash,
          );
          const availabilityA = jest.spyOn(escrowA, 'isAvailable');
          const availabilityB = jest.spyOn(escrowB, 'isAvailable');
          const controller = new MfaRecoveryController({
            ...options,
            messenger: getMessenger(getRootMessenger()),
            state: { pendingOperation: JSON.stringify(pending) },
          });

          await expect(controller.resume()).rejects.toMatchObject({
            code: 'invalid_pending_operation',
          });

          expect(availabilityA).not.toHaveBeenCalled();
          expect(availabilityB).not.toHaveBeenCalled();
        });
      },
    );
  });

  describe('hang resilience', () => {
    const PROMPT_TIMEOUT_MS = 30_000;
    const REQUEST_TIMEOUT_MS = 5_000;

    type MfaRecoveryControllerTimeoutOptions = MfaRecoveryControllerOptions & {
      promptTimeoutMs?: number;
      requestTimeoutMs?: number;
    };

    function createControllerWithTimeouts(
      escrowA: StubEscrowProvider,
      escrowB: StubEscrowProvider,
      overrides: Partial<MfaRecoveryControllerTimeoutOptions> = {},
    ): {
      controller: MfaRecoveryController;
      authProvider: StubAuthProvider;
      identifierAuthProvider: StubIdentifierAuthProvider;
    } {
      const authProvider = new StubAuthProvider();
      const identifierAuthProvider = new StubIdentifierAuthProvider();
      const controller = new MfaRecoveryController({
        messenger: getMessenger(getRootMessenger()),
        authProvider,
        identifierAuthProvider,
        escrows: [escrowA, escrowB],
        pendingOperationEncryptor: passthroughEncryptor,
        ...overrides,
      });
      return { controller, authProvider, identifierAuthProvider };
    }

    it('resolves getPhase while authorizeRecoveryRequest is hung', async () => {
      await withController(async ({ escrowA, escrowB }) => {
        const { controller, authProvider } = createControllerWithTimeouts(
          escrowA,
          escrowB,
        );
        authProvider.authorizeRecoveryRequestHang.enabled = true;
        const mutation = controller.register(SECRET, IDENTIFIERS);
        try {
          await waitForHang(authProvider.authorizeRecoveryRequestHang);

          const phase = await raceWithDeadline(controller.getPhase(), 100);
          expect(phase).toBe('authorizing');
        } finally {
          authProvider.authorizeRecoveryRequestHang.release();
          await mutation;
        }
      });
    });

    it('resolves getRecoverySecret while authorizeRecoveryRequest is hung', async () => {
      await withController(async ({ escrowA, escrowB }) => {
        const { controller, authProvider } = createControllerWithTimeouts(
          escrowA,
          escrowB,
        );
        await controller.register(SECRET, IDENTIFIERS);
        authProvider.authorizeRecoveryRequestHang.enabled = true;
        const mutation = controller.updateRecoverySecret(
          PASSKEY,
          SECRET_2,
          REGISTERED_EPOCH,
        );
        try {
          await waitForHang(authProvider.authorizeRecoveryRequestHang);

          const recovered = await raceWithDeadline(
            recover(controller, PASSKEY),
            100,
          );
          expect(bytesToHex(recovered.recoverySecret)).toBe(bytesToHex(SECRET));
          expect(recovered.epoch).toBe(REGISTERED_EPOCH);
        } finally {
          authProvider.authorizeRecoveryRequestHang.release();
          await mutation;
        }
      });
    });

    it('aborts a hung authorizeRecoveryRequest through AbortSignal', async () => {
      await withController(async ({ escrowA, escrowB }) => {
        const { controller, authProvider } = createControllerWithTimeouts(
          escrowA,
          escrowB,
        );
        authProvider.authorizeRecoveryRequestHang.enabled = true;
        const mutation = controller.register(SECRET, IDENTIFIERS);
        await waitForHang(authProvider.authorizeRecoveryRequestHang);

        await raceWithDeadline(controller.abort(), 100);
        await expect(
          raceWithDeadline(mutation, 100, 'mutation'),
        ).rejects.toMatchObject({
          code: 'operation_aborted',
        });
        expect(await raceWithDeadline(controller.getPhase(), 100)).toBe('idle');
        expect(authProvider.lastAuthorizeRecoveryRequestSignal?.aborted).toBe(
          true,
        );
      });
    });

    it('cancels a resume queued behind a hung authorizing mutation on abort', async () => {
      await withController(async ({ escrowA, escrowB }) => {
        const { controller, authProvider } = createControllerWithTimeouts(
          escrowA,
          escrowB,
          { promptTimeoutMs: PROMPT_TIMEOUT_MS },
        );
        const authorizeSpy = jest.spyOn(
          authProvider,
          'authorizeRecoveryRequest',
        );
        const applyASpy = jest.spyOn(escrowA, 'applyMutation');
        const applyBSpy = jest.spyOn(escrowB, 'applyMutation');
        authProvider.authorizeRecoveryRequestHang.enabled = true;
        const mutation = controller.register(SECRET, IDENTIFIERS);
        const mutationSettled = mutation.catch((error: unknown) => error);
        await waitForHang(authProvider.authorizeRecoveryRequestHang);
        const resumePromise = controller.resume();
        const resumeSettled = resumePromise.catch((error: unknown) => error);

        try {
          await raceWithDeadline(controller.abort(), 100);
          expect(await raceWithDeadline(mutationSettled, 100)).toMatchObject({
            code: 'operation_aborted',
          });
          expect(await raceWithDeadline(resumeSettled, 100)).toMatchObject({
            code: 'operation_aborted',
          });
          expect(authorizeSpy).toHaveBeenCalledTimes(1);
          expect(applyASpy).not.toHaveBeenCalled();
          expect(applyBSpy).not.toHaveBeenCalled();
          expect(await raceWithDeadline(controller.getPhase(), 100)).toBe(
            'idle',
          );
        } finally {
          authProvider.authorizeRecoveryRequestHang.release();
          await mutationSettled;
          await resumeSettled;
        }
      });
    });

    it('cancels a hung identifier prompt on abort but rejects abort while writing', async () => {
      await withController(async ({ controller, escrowA, options }) => {
        await controller.register(SECRET, IDENTIFIERS);
        escrowA.failNextApplyCount = 1;
        await expect(
          controller.updateRecoverySecret(PASSKEY, SECRET_2, REGISTERED_EPOCH),
        ).rejects.toBeInstanceOf(IncompleteMutationError);

        const identifierAuthProvider =
          options.identifierAuthProvider as StubIdentifierAuthProvider;
        identifierAuthProvider.getKeyBoundIdentifierTokenHang.enabled = true;
        const resumePromise = controller.resume();
        const resumeSettled = resumePromise.catch(() => undefined);
        try {
          await waitForHang(
            identifierAuthProvider.getKeyBoundIdentifierTokenHang,
          );

          await expect(
            raceWithDeadline(controller.abort(), 100),
          ).rejects.toMatchObject({
            code: 'abort_not_allowed',
          });
          expect(
            identifierAuthProvider.lastGetKeyBoundIdentifierTokenSignal
              ?.aborted,
          ).toBe(true);
          expect(await raceWithDeadline(controller.getPhase(), 100)).toBe(
            'writing',
          );
        } finally {
          identifierAuthProvider.getKeyBoundIdentifierTokenHang.release();
          await resumeSettled;
        }
      });
    });

    it('cancels a hung escrow availability check on abort without writing', async () => {
      await withController(async ({ controller, escrowA, escrowB }) => {
        const applyA = jest.spyOn(escrowA, 'applyMutation');
        const applyB = jest.spyOn(escrowB, 'applyMutation');
        escrowA.isAvailableHang.enabled = true;
        const mutation = controller.register(SECRET, IDENTIFIERS);
        const mutationSettled = mutation.catch((error: unknown) => error);
        try {
          await waitForHang(escrowA.isAvailableHang);

          await raceWithDeadline(controller.abort(), 100);
          expect(await raceWithDeadline(mutationSettled, 100)).toMatchObject({
            code: 'operation_aborted',
          });
          expect(escrowA.lastIsAvailableSignal?.aborted).toBe(true);
          expect(applyA).not.toHaveBeenCalled();
          expect(applyB).not.toHaveBeenCalled();
          expect(await controller.getPhase()).toBe('idle');
        } finally {
          escrowA.isAvailableHang.release();
          await mutationSettled;
        }
      });
    });

    it('cancels a hung escrow challenge on abort without writing', async () => {
      await withController(async ({ controller, escrowA, escrowB }) => {
        await controller.register(SECRET, IDENTIFIERS);
        const applyA = jest.spyOn(escrowA, 'applyMutation');
        const applyB = jest.spyOn(escrowB, 'applyMutation');
        const challengeHang = new HangSwitch();
        challengeHang.enabled = true;
        const generateChallenge = escrowA.generateChallenge.bind(escrowA);
        const challengeSpy = jest
          .spyOn(escrowA, 'generateChallenge')
          .mockImplementation(async (challengeOptions) => {
            await challengeHang.wait(challengeOptions?.signal);
            return await generateChallenge(challengeOptions);
          });
        const mutation = controller.updateRecoverySecret(
          PASSKEY,
          SECRET_2,
          REGISTERED_EPOCH,
        );
        const mutationSettled = mutation.catch((error: unknown) => error);
        try {
          await waitForHang(challengeHang);

          await raceWithDeadline(controller.abort(), 100);
          expect(await raceWithDeadline(mutationSettled, 100)).toMatchObject({
            code: 'operation_aborted',
          });
          expect(challengeSpy.mock.calls[0][0]?.signal?.aborted).toBe(true);
          expect(applyA).not.toHaveBeenCalled();
          expect(applyB).not.toHaveBeenCalled();
          expect(await controller.getPhase()).toBe('idle');
        } finally {
          challengeHang.release();
          await mutationSettled;
        }
      });
    });

    it('rejects abort immediately while applyMutation is hung', async () => {
      await withController(async ({ controller, escrowA }) => {
        await controller.register(SECRET, IDENTIFIERS);
        escrowA.applyMutationHang.enabled = true;
        const mutation = controller.updateRecoverySecret(
          PASSKEY,
          SECRET_2,
          REGISTERED_EPOCH,
        );
        await waitForHang(escrowA.applyMutationHang);

        await expect(
          raceWithDeadline(controller.abort(), 100),
        ).rejects.toMatchObject({
          code: 'abort_not_allowed',
        });
        expect(escrowA.lastApplyMutationSignal?.aborted).not.toBe(true);

        escrowA.applyMutationHang.release();
        await mutation;
      });
    });

    describe('timeouts', () => {
      it('rejects identifier prompts that exceed promptTimeoutMs', async () => {
        jest.useFakeTimers();
        try {
          await withController(async ({ escrowA, escrowB }) => {
            const { controller, identifierAuthProvider } =
              createControllerWithTimeouts(escrowA, escrowB, {
                promptTimeoutMs: PROMPT_TIMEOUT_MS,
              });
            await controller.register(SECRET, IDENTIFIERS);
            identifierAuthProvider.getKeyBoundIdentifierTokenHang.enabled = true;
            const mutation = controller.updateRecoverySecret(
              PASSKEY,
              SECRET_2,
              REGISTERED_EPOCH,
            );
            await waitForHang(
              identifierAuthProvider.getKeyBoundIdentifierTokenHang,
            );

            await jest.advanceTimersByTimeAsync(PROMPT_TIMEOUT_MS + 1);
            await expect(
              raceWithDeadline(mutation, 100, 'mutation'),
            ).rejects.toMatchObject({
              code: 'prompt_timeout',
            });
            expect(await raceWithDeadline(controller.getPhase(), 100)).toBe(
              'authorizing',
            );

            identifierAuthProvider.getKeyBoundIdentifierTokenHang.release();
            await jest.advanceTimersByTimeAsync(100);
            await mutation.catch(() => undefined);
          });
        } finally {
          jest.useRealTimers();
        }
      });

      it('treats hung isAvailable as unavailable after requestTimeoutMs', async () => {
        jest.useFakeTimers();
        try {
          await withController(async ({ escrowA, escrowB }) => {
            const { controller } = createControllerWithTimeouts(
              escrowA,
              escrowB,
              { requestTimeoutMs: REQUEST_TIMEOUT_MS },
            );
            escrowA.isAvailableHang.enabled = true;
            escrowB.isAvailableHang.enabled = true;
            const mutation = controller.register(SECRET, IDENTIFIERS);
            await waitForHang(escrowA.isAvailableHang);

            await jest.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 1);
            await expect(
              raceWithDeadline(mutation, 100, 'mutation'),
            ).rejects.toMatchObject({
              code: 'escrow_unavailable',
            });
            expect(await raceWithDeadline(controller.getPhase(), 100)).toBe(
              'authorizing',
            );

            escrowA.isAvailableHang.release();
            escrowB.isAvailableHang.release();
            await jest.advanceTimersByTimeAsync(100);
            await mutation.catch(() => undefined);
          });
        } finally {
          jest.useRealTimers();
        }
      });

      it('surfaces IncompleteMutationError when applyMutation hangs past requestTimeoutMs', async () => {
        jest.useFakeTimers();
        try {
          await withController(async ({ escrowA, escrowB }) => {
            const { controller } = createControllerWithTimeouts(
              escrowA,
              escrowB,
              { requestTimeoutMs: REQUEST_TIMEOUT_MS },
            );
            await controller.register(SECRET, IDENTIFIERS);
            escrowA.applyMutationHang.enabled = true;
            const mutation = controller.updateRecoverySecret(
              PASSKEY,
              SECRET_2,
              REGISTERED_EPOCH,
            );
            await waitForHang(escrowA.applyMutationHang);

            await jest.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 1);
            await expect(
              raceWithDeadline(mutation, 100, 'mutation'),
            ).rejects.toBeInstanceOf(IncompleteMutationError);
            expect(await raceWithDeadline(controller.getPhase(), 100)).toBe(
              'writing',
            );

            escrowA.applyMutationHang.release();
            await jest.advanceTimersByTimeAsync(100);
            await mutation.catch(() => undefined);
          });
        } finally {
          jest.useRealTimers();
        }
      });

      it('surfaces read_failed when getSecret hangs past requestTimeoutMs', async () => {
        jest.useFakeTimers();
        try {
          await withController(async ({ escrowA, escrowB }) => {
            const { controller } = createControllerWithTimeouts(
              escrowA,
              escrowB,
              { requestTimeoutMs: REQUEST_TIMEOUT_MS },
            );
            await controller.register(SECRET, IDENTIFIERS);
            escrowA.getSecretHang.enabled = true;
            escrowB.getSecretHang.enabled = true;
            const read = recover(controller, PASSKEY);

            await waitForHang(escrowA.getSecretHang);
            await jest.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 1);
            await expect(
              raceWithDeadline(read, 100, 'read'),
            ).rejects.toMatchObject({
              code: 'read_failed',
            });

            escrowA.getSecretHang.release();
            escrowB.getSecretHang.release();
            await jest.advanceTimersByTimeAsync(100);
            await read.catch(() => undefined);
          });
        } finally {
          jest.useRealTimers();
        }
      });
    });
  });

  describe('constructor timeout options', () => {
    it.each([
      ['requestTimeoutMs', 0],
      ['promptTimeoutMs', -1],
      ['promptTimeoutMs', Number.NaN],
    ] as const)('throws when %s is invalid', (option, value) => {
      const rootMessenger = getRootMessenger();
      const escrowA = new StubEscrowProvider('escrow-a');
      const escrowB = new StubEscrowProvider('escrow-b');
      expect(
        () =>
          new MfaRecoveryController({
            messenger: getMessenger(rootMessenger),
            authProvider: new StubAuthProvider(),
            identifierAuthProvider: new StubIdentifierAuthProvider(),
            escrows: [escrowA, escrowB],
            pendingOperationEncryptor: passthroughEncryptor,
            [option]: value,
          }),
      ).toThrow(MfaRecoveryError);
    });
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
  });
});

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<MfaRecoveryControllerMessenger>,
  MessengerEvents<MfaRecoveryControllerMessenger>
>;

type WithControllerCallback<ReturnValue> = (payload: {
  controller: MfaRecoveryController;
  rootMessenger: RootMessenger;
  controllerMessenger: MfaRecoveryControllerMessenger;
  escrowA: StubEscrowProvider;
  escrowB: StubEscrowProvider;
  options: MfaRecoveryControllerOptions;
}) => Promise<ReturnValue> | ReturnValue;

function getRootMessenger(): RootMessenger {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE });
}

function getMessenger(
  rootMessenger: RootMessenger,
): MfaRecoveryControllerMessenger {
  return new Messenger({
    namespace: 'MfaRecoveryController',
    parent: rootMessenger,
  });
}

function getOptions(
  escrowA: StubEscrowProvider,
  escrowB: StubEscrowProvider,
): MfaRecoveryControllerOptions {
  return {
    messenger: getMessenger(getRootMessenger()),
    authProvider: new StubAuthProvider(),
    identifierAuthProvider: new StubIdentifierAuthProvider(),
    escrows: [escrowA, escrowB],
    pendingOperationEncryptor: passthroughEncryptor,
  };
}

async function recover(
  controller: MfaRecoveryController,
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
  const payloadHash = hash(payload);
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
      requestHash: hash(fields),
    },
    authControllerToken: createAuthControllerToken({
      sub: 'profile-1',
      exp: unixNow() + 60,
      requestHash: hash(fields),
      aal: 2,
    }),
    payload,
    identifier: PASSKEY,
    receipts: [],
  };
}

/**
 * @param value - JSON value to encode.
 * @returns The value as an unpadded base64url JWT segment.
 */
function encodeJwtSegment(value: unknown): string {
  return bytesToBase64(stringToBytes(JSON.stringify(value)))
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_')
    .replace(/[=]+$/u, '');
}

async function waitForHang(hang: HangSwitch): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!hang.isWaiting) {
    if (Date.now() >= deadline) {
      throw new Error('Timed out waiting for hang switch');
    }
    await Promise.resolve();
  }
}

async function raceWithDeadline<Result>(
  promise: Promise<Result>,
  deadlineMs: number,
  label = 'operation',
): Promise<Result> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} blocked past ${deadlineMs}ms`)),
      deadlineMs,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
    promise.catch(() => undefined);
  }
}

async function withController<ReturnValue>(
  testFunction: WithControllerCallback<ReturnValue>,
): Promise<ReturnValue> {
  const rootMessenger = getRootMessenger();
  const controllerMessenger = getMessenger(rootMessenger);
  const replicaIds = ['escrow-a', 'escrow-b'];
  const escrowA = new StubEscrowProvider(
    'escrow-a',
    generateSigningKey(),
    replicaIds,
  );
  const escrowB = new StubEscrowProvider(
    'escrow-b',
    generateSigningKey(),
    replicaIds,
  );
  const options = {
    ...getOptions(escrowA, escrowB),
    messenger: controllerMessenger,
  };
  const controller = new MfaRecoveryController(options);
  return await testFunction({
    controller,
    rootMessenger,
    controllerMessenger,
    escrowA,
    escrowB,
    options,
  });
}
