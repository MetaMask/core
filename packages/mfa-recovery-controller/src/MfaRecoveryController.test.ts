import { deriveStateFromMetadata } from '@metamask/base-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import { bytesToHex } from '@metamask/utils';

import {
  StubAuthProvider,
  StubEscrowProvider,
  StubIdentifierAuthProvider,
  passthroughEncryptor,
} from '../tests/stubs.js';
import { canonicalizeIdentifiers, hash } from './crypto.js';
import { MutationRepairPendingError } from './errors.js';
import type {
  MfaRecoveryControllerMessenger,
  MfaRecoveryControllerOptions,
} from './MfaRecoveryController.js';
import { MfaRecoveryController } from './MfaRecoveryController.js';
import type {
  Identifier,
  MutationReceipt,
  WritingPendingOperation,
} from './types.js';

const PASSKEY: Identifier = {
  type: 'passkey',
  namespace: 'example.com',
  value: 'cred-1',
  verifier: { publicKey: 'pk' },
};

const EMAIL: Identifier = {
  type: 'emailOtp',
  namespace: 'email',
  value: 'user@example.com',
  verifier: null,
};

const SECRET = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
const SECRET_2 = new Uint8Array([8, 7, 6, 5, 4, 3, 2, 1]);

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
            collectChallengeResponse: async (): Promise<string> => 'otp',
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
            collectChallengeResponse: async (): Promise<string> => 'otp',
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
      await withController(async ({ controller, escrowA }) => {
        const verifyReceipt = jest.spyOn(escrowA, 'verifyReceipt');
        await controller.register(SECRET, [PASSKEY]);
        expect(controller.state.pendingOperation).toBeNull();
        expect(await controller.getPhase()).toBe('idle');
        expect(verifyReceipt.mock.calls[0][2]).toBe('escrow-a');

        const recovered = await controller.getRecoverySecret(PASSKEY);
        expect(bytesToHex(recovered)).toBe(bytesToHex(SECRET));
      });
    });

    it('publishes state changes through the stateChanged event', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        const listener = jest.fn();
        rootMessenger.subscribe('MfaRecoveryController:stateChanged', listener);

        await controller.register(SECRET, [PASSKEY]);

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
          'Registration requires at least one identifier',
        );
      });
    });

    it('rejects a second registration for the same profile', async () => {
      await withController(async ({ controller }) => {
        await controller.register(SECRET, [PASSKEY]);
        await expect(controller.register(SECRET, [PASSKEY])).rejects.toThrow(
          'Profile is already registered',
        );
      });
    });
  });

  describe('getRecoverySecret', () => {
    it('returns the highest consistent version when one escrow is down', async () => {
      await withController(async ({ controller, escrowB }) => {
        await controller.register(SECRET, [PASSKEY]);
        escrowB.available = false;
        const recovered = await controller.getRecoverySecret(PASSKEY);
        expect(bytesToHex(recovered)).toBe(bytesToHex(SECRET));
      });
    });

    it('throws when matching versions disagree', async () => {
      await withController(async ({ controller, escrowB }) => {
        await controller.register(SECRET, [PASSKEY]);
        escrowB.patchRecord('profile-1', {
          lastMutationId: '0xdifferent',
        });
        await expect(controller.getRecoverySecret(PASSKEY)).rejects.toThrow(
          'Replica corruption',
        );
      });
    });

    it('throws when no escrow is available', async () => {
      await withController(async ({ controller, escrowA, escrowB }) => {
        escrowA.available = false;
        escrowB.available = false;
        await expect(controller.getRecoverySecret(PASSKEY)).rejects.toThrow(
          'No escrow is available',
        );
      });
    });

    it('throws when every available escrow fails the read', async () => {
      await withController(async ({ controller, escrowA, escrowB }) => {
        await controller.register(SECRET, [PASSKEY]);
        escrowA.failGetSecret = true;
        escrowB.failGetSecret = true;
        await expect(controller.getRecoverySecret(PASSKEY)).rejects.toThrow(
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

          await controller.register(SECRET, [PASSKEY]);

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
      await withController(async ({ controller }) => {
        await controller.register(SECRET, [PASSKEY]);
        await controller.updateRecoverySecret(PASSKEY, SECRET_2);
        const recovered = await controller.getRecoverySecret(PASSKEY);
        expect(bytesToHex(recovered)).toBe(bytesToHex(SECRET_2));
      });
    });

    it('throws when a configured escrow is unavailable', async () => {
      await withController(async ({ controller, escrowB }) => {
        await controller.register(SECRET, [PASSKEY]);
        escrowB.available = false;
        await expect(
          controller.updateRecoverySecret(PASSKEY, SECRET_2),
        ).rejects.toThrow('All configured escrows are required for mutation');
      });
    });

    it('throws when replicas disagree on version', async () => {
      await withController(async ({ controller, escrowB }) => {
        await controller.register(SECRET, [PASSKEY]);
        escrowB.patchRecord('profile-1', { version: 2 });
        await expect(
          controller.updateRecoverySecret(PASSKEY, SECRET_2),
        ).rejects.toThrow('Escrows disagree on recovery version');
      });
    });

    it('throws when a replica is missing the recovery record', async () => {
      await withController(async ({ controller, escrowB }) => {
        await controller.register(SECRET, [PASSKEY]);
        escrowB.clearRecord('profile-1');
        await expect(
          controller.updateRecoverySecret(PASSKEY, SECRET_2),
        ).rejects.toThrow('Recovery record missing at a configured escrow');
      });
    });
  });

  describe('updateIdentifiers', () => {
    it('replaces the identifier set using escrow-challenge auth', async () => {
      await withController(async ({ controller }) => {
        await controller.register(SECRET, [PASSKEY, EMAIL]);
        await controller.updateIdentifiers(EMAIL, [EMAIL]);
        const recovered = await controller.getRecoverySecret(EMAIL);
        expect(bytesToHex(recovered)).toBe(bytesToHex(SECRET));
      });
    });

    it('rejects an empty identifier list', async () => {
      await withController(async ({ controller }) => {
        await controller.register(SECRET, [PASSKEY]);
        await expect(controller.updateIdentifiers(PASSKEY, [])).rejects.toThrow(
          'Identifier list must be non-empty',
        );
      });
    });
  });

  describe('resume and abort', () => {
    it('resumes a persisted writing mutation after a replica failure', async () => {
      await withController(async ({ controller, escrowA }) => {
        await controller.register(SECRET, [PASSKEY]);
        escrowA.failNextApplyCount = 1;
        await expect(
          controller.updateRecoverySecret(PASSKEY, SECRET_2),
        ).rejects.toBeInstanceOf(MutationRepairPendingError);
        expect(await controller.getPhase()).toBe('writing');

        await controller.resume();
        expect(await controller.getPhase()).toBe('idle');
        const recovered = await controller.getRecoverySecret(PASSKEY);
        expect(bytesToHex(recovered)).toBe(bytesToHex(SECRET_2));
      });
    });

    it('repairs only the missing replica when an acknowledged replica is offline', async () => {
      await withController(async ({ controller, escrowA, escrowB }) => {
        await controller.register(SECRET, [PASSKEY]);
        escrowA.failNextApplyCount = 1;
        await expect(
          controller.updateRecoverySecret(PASSKEY, SECRET_2),
        ).rejects.toBeInstanceOf(MutationRepairPendingError);

        escrowB.available = false;

        await controller.resume();

        expect(await controller.getPhase()).toBe('idle');
        expect(bytesToHex(await controller.getRecoverySecret(PASSKEY))).toBe(
          bytesToHex(SECRET_2),
        );
      });
    });

    it('clears a fully acknowledged mutation without checking escrow availability', async () => {
      await withController(async ({ controller, escrowA, escrowB }) => {
        await controller.register(SECRET, [PASSKEY]);
        const pending = await getValidWritingPending();
        pending.receipts = ['escrow-a', 'escrow-b'].map(
          (escrowId): MutationReceipt => ({
            mutationId: pending.mutation.id,
            requestHash: pending.mutation.requestHash,
            escrowId,
            version: pending.mutation.newVersion,
            signature: '0xsignature',
          }),
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
        const validPending = await getValidWritingPending();
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

        const writing = await passthroughEncryptor.encrypt(validPending);
        const writingMessenger = getMessenger(getRootMessenger());
        const writingController = new MfaRecoveryController({
          ...options,
          messenger: writingMessenger,
          state: { pendingOperation: writing },
        });
        await expect(writingController.abort()).rejects.toThrow(
          'Cannot abort a mutation once writing has begun',
        );
        expect(await writingController.getPhase()).toBe('writing');
      });
    });

    it('resumes an authorizing mutation', async () => {
      await withController(async ({ options }) => {
        const payload = {
          recoverySecret: bytesToHex(SECRET),
          identifiers: [PASSKEY],
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
        expect(bytesToHex(await controller.getRecoverySecret(PASSKEY))).toBe(
          bytesToHex(SECRET),
        );
      });
    });

    it('resumes a persisted authorizing updateIdentifiers mutation', async () => {
      await withController(async ({ controller, options }) => {
        await controller.register(SECRET, [PASSKEY]);
        const payload = { identifiers: [EMAIL] };
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
          messenger: getMessenger(getRootMessenger()),
          state: {
            pendingOperation: await passthroughEncryptor.encrypt(authorizing),
          },
        });

        await resumed.resume();

        expect(await resumed.getPhase()).toBe('idle');
        expect(bytesToHex(await resumed.getRecoverySecret(EMAIL))).toBe(
          bytesToHex(SECRET),
        );
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
      await withController(async ({ controller, options }) => {
        await controller.register(SECRET, [PASSKEY]);
        const mutation = {
          id: '0xmut',
          profileId: 'profile-1',
          operation: 'updateRecoverySecret' as const,
          expectedVersion: 1,
          newVersion: 2,
          payloadHash: await hash({
            recoverySecret: bytesToHex(SECRET_2),
          }),
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
          {
            mutationId: mutation.id,
            requestHash: mutation.requestHash,
            escrowId: 'escrow-a',
            version: 2,
            signature: '0x',
          },
          {
            mutationId: mutation.id,
            requestHash: mutation.requestHash,
            escrowId: 'escrow-b',
            version: 2,
            signature: '0x',
          },
        ];
        const writing = await passthroughEncryptor.encrypt({
          phase: 'writing',
          mutation,
          authControllerToken: {
            profileId: 'profile-1',
            requestHash: mutation.requestHash,
            twoFactor: true,
            issuer: 'stub-auth',
            expiresAt: Date.now() + 60_000,
            signature: 'stub-auth-signature',
          },
          payload: { recoverySecret: bytesToHex(SECRET_2) },
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
      });
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
            identifiers: [PASSKEY],
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
          authControllerToken: {
            profileId: 'profile-1',
            requestHash: '0x',
            issuer: 'stub-auth',
            expiresAt: Date.now() + 60_000,
            signature: 'stub-auth-signature',
          },
          payload: {
            recoverySecret: bytesToHex(SECRET),
            identifiers: [PASSKEY],
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
          recoverySecret: bytesToHex(SECRET),
          identifiers: [PASSKEY],
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
        const writing = await passthroughEncryptor.encrypt({
          phase: 'writing',
          mutation,
          authControllerToken: {
            profileId: 'profile-1',
            requestHash: mutation.requestHash,
            identifiersHash: await hash(
              canonicalizeIdentifiers(payload.identifiers),
            ),
            identifierOwnershipApproved: true,
            issuer: 'stub-auth',
            expiresAt: Date.now() + 60_000,
            signature: 'stub-auth-signature',
          },
          payload,
          identifier: null,
          receipts: [
            {
              mutationId: '0xmut',
              requestHash: mutation.requestHash,
              escrowId: 'escrow-z',
              version: 1,
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
          recoverySecret: bytesToHex(SECRET),
          identifiers: [PASSKEY],
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
        const writing = await passthroughEncryptor.encrypt({
          phase: 'writing',
          mutation,
          authControllerToken: {
            profileId: 'profile-1',
            requestHash: mutation.requestHash,
            identifiersHash: await hash(
              canonicalizeIdentifiers(payload.identifiers),
            ),
            identifierOwnershipApproved: true,
            issuer: 'stub-auth',
            expiresAt: Date.now() + 60_000,
            signature: 'stub-auth-signature',
          },
          payload,
          identifier: null,
          receipts: [
            {
              mutationId: '0xmut',
              requestHash: mutation.requestHash,
              escrowId: 'escrow-a',
              version: 1,
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
        await expect(controller.register(SECRET, [PASSKEY])).rejects.toThrow(
          'Invalid mutation receipt',
        );
      });
    });

    it('persists valid receipts before reporting an invalid receipt', async () => {
      await withController(async ({ controller, escrowA, escrowB }) => {
        escrowA.invalidReceipts = true;

        await expect(controller.register(SECRET, [PASSKEY])).rejects.toThrow(
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
          signature: '0xsignature',
        });
        jest.spyOn(escrowA, 'verifyReceipt').mockReturnValue(true);

        await expect(controller.register(SECRET, [PASSKEY])).rejects.toThrow(
          'Invalid mutation receipt',
        );
      });
    });

    it('treats receipt verification errors as invalid receipts', async () => {
      await withController(async ({ controller, escrowA }) => {
        jest.spyOn(escrowA, 'verifyReceipt').mockImplementation(() => {
          throw new Error('verification failed');
        });

        await expect(controller.register(SECRET, [PASSKEY])).rejects.toThrow(
          'Invalid mutation receipt',
        );
      });
    });

    it('refreshes an expired AuthController token while resuming', async () => {
      await withController(async ({ controller, escrowA, options }) => {
        await controller.register(SECRET, [PASSKEY]);
        escrowA.failNextApplyCount = 1;
        await expect(
          controller.updateRecoverySecret(PASSKEY, SECRET_2),
        ).rejects.toBeInstanceOf(MutationRepairPendingError);
        const pending = JSON.parse(
          controller.state.pendingOperation as string,
        ) as { authControllerToken: { expiresAt: number } };
        pending.authControllerToken.expiresAt = 0;
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
        name: 'an identifier payload with invalid entries',
        mutate: (pending: Record<string, unknown>): void => {
          const mutation = pending.mutation as Record<string, unknown>;
          mutation.operation = 'updateIdentifiers';
          pending.payload = { identifiers: [{}] };
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
          const token = pending.authControllerToken as Record<string, unknown>;
          token.requestHash = '0xwrong-token-request-hash';
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
            JSON.stringify(await getValidWritingPending()),
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
  });

  describe('identifier registry', () => {
    it('rejects unknown identifier types', async () => {
      await withController(async ({ controller }) => {
        await expect(
          controller.register(SECRET, [
            { type: 'unknown', namespace: 'x', value: 'y', verifier: null },
          ]),
        ).rejects.toThrow('Unknown identifier type');
      });
    });
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
    collectChallengeResponse: async (): Promise<string> => 'otp',
  };
}

async function getValidWritingPending(): Promise<WritingPendingOperation> {
  const payload = { recoverySecret: bytesToHex(SECRET_2) };
  const payloadHash = await hash(payload);
  const fields = {
    id: '0xvalid-pending',
    profileId: 'profile-1',
    operation: 'updateRecoverySecret' as const,
    expectedVersion: 1,
    newVersion: 2,
    payloadHash,
    audiences: ['escrow-a', 'escrow-b'],
  };
  return {
    phase: 'writing',
    mutation: {
      ...fields,
      requestHash: await hash(fields),
    },
    authControllerToken: {
      profileId: 'profile-1',
      requestHash: await hash(fields),
      twoFactor: true,
      issuer: 'stub-auth',
      expiresAt: Date.now() + 60_000,
      signature: 'stub-auth-signature',
    },
    payload,
    identifier: PASSKEY,
    receipts: [],
  };
}

async function withController<ReturnValue>(
  testFunction: WithControllerCallback<ReturnValue>,
): Promise<ReturnValue> {
  const rootMessenger = getRootMessenger();
  const controllerMessenger = getMessenger(rootMessenger);
  const escrowA = new StubEscrowProvider('escrow-a');
  const escrowB = new StubEscrowProvider('escrow-b');
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
