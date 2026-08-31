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
import { hash } from './crypto.js';
import { MutationRepairPendingError } from './errors.js';
import type {
  MfaRecoveryControllerMessenger,
  MfaRecoveryControllerOptions,
} from './MfaRecoveryController.js';
import { MfaRecoveryController } from './MfaRecoveryController.js';
import type { Identifier } from './types.js';

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
      await withController(async ({ controller }) => {
        await controller.register(SECRET, [PASSKEY]);
        expect(controller.state.pendingOperation).toBeNull();
        expect(await controller.getPhase()).toBe('idle');

        const recovered = await controller.getRecoverySecret(PASSKEY);
        expect(bytesToHex(recovered)).toBe(bytesToHex(SECRET));
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

    it('aborts an authorizing mutation and refuses to abort writing', async () => {
      await withController(async ({ options }) => {
        const authorizing = await passthroughEncryptor.encrypt({
          phase: 'authorizing',
          mutation: {
            id: '0xmut',
            profileId: 'profile-1',
            operation: 'register',
            expectedVersion: 0,
            newVersion: 1,
            payloadHash: '0x',
            audiences: ['escrow-a', 'escrow-b'],
            requestHash: '0x',
          },
          payload: {
            recoverySecret: bytesToHex(SECRET),
            identifiers: [PASSKEY],
          },
          identifier: null,
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
          phase: 'writing',
          mutation: {
            id: '0xmut',
            profileId: 'profile-1',
            operation: 'register',
            expectedVersion: 0,
            newVersion: 1,
            payloadHash: '0x',
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
        const writing = await passthroughEncryptor.encrypt({
          phase: 'writing',
          mutation: {
            id: '0xmut',
            profileId: 'profile-1',
            operation: 'register',
            expectedVersion: 0,
            newVersion: 1,
            payloadHash,
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
          payload,
          identifier: null,
          receipts: [
            {
              mutationId: '0xmut',
              requestHash: '0x',
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
        const writing = await passthroughEncryptor.encrypt({
          phase: 'writing',
          mutation: {
            id: '0xmut',
            profileId: 'profile-1',
            operation: 'register',
            expectedVersion: 0,
            newVersion: 1,
            payloadHash,
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
          payload,
          identifier: null,
          receipts: [
            {
              mutationId: '0xmut',
              requestHash: '0x',
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

async function withController<ReturnValue>(
  testFunction: WithControllerCallback<ReturnValue>,
): Promise<ReturnValue> {
  const rootMessenger = getRootMessenger();
  const controllerMessenger = getMessenger(rootMessenger);
  const escrowA = new StubEscrowProvider('escrow-a');
  const escrowB = new StubEscrowProvider('escrow-b');
  const options: MfaRecoveryControllerOptions = {
    messenger: controllerMessenger,
    authProvider: new StubAuthProvider(),
    identifierAuthProvider: new StubIdentifierAuthProvider(),
    escrows: [escrowA, escrowB],
    pendingOperationEncryptor: passthroughEncryptor,
    collectChallengeResponse: async (): Promise<string> => 'otp',
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
