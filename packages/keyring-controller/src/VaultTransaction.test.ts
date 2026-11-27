import type { Keyring as KeyringV2 } from '@metamask/keyring-api/v2';
import type { EthKeyring } from '@metamask/keyring-internal-api';
import type { Hex, Json } from '@metamask/utils';
import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import type {
  CachedEncryptionKey,
  KeyringEntry,
  KeyringMetadata,
  SerializedKeyring,
} from './KeyringController.js';
import { VaultTransaction } from './VaultTransaction.js';
import type {
  TransactionScope,
  VaultOperations,
  VaultPersistPolicy,
  VaultSession,
  WalletTransactionScope,
} from './VaultTransaction.js';

const FIRST_ENCRYPTION_KEY: CachedEncryptionKey = {
  serialized: 'first-key',
  salt: 'first-salt',
};

const SECOND_ENCRYPTION_KEY: CachedEncryptionKey = {
  serialized: 'second-key',
  salt: 'second-salt',
};

/**
 * A shared resource, as the SDK singleton of hardware keyrings: only one
 * keyring instance holds it at a time; acquiring it while another instance
 * holds it fails, and destroying the holder releases it.
 */
let sharedResourceHeld = false;

/**
 * Acquire the shared resource.
 *
 * @throws While another instance holds it.
 */
function acquireSharedResource(): void {
  if (sharedResourceHeld) {
    throw new Error('Init_AlreadyInitialized');
  }
  sharedResourceHeld = true;
}

/**
 * Release the shared resource.
 */
function releaseSharedResource(): void {
  sharedResourceHeld = false;
}

type FakeKeyringOptions = {
  type?: string;
  serialize?: () => Promise<Json>;
  destroy?: () => Promise<void>;
};

const buildFakeKeyring = ({
  type = 'Fake Keyring',
  serialize,
  destroy,
}: FakeKeyringOptions = {}): EthKeyring => ({
  type,
  ...(destroy ? { destroy } : {}),
  serialize: serialize ?? (async (): Promise<Json> => ({})),
  deserialize: async (): Promise<void> => undefined,
  getAccounts: async (): Promise<Hex[]> => [],
  addAccounts: async (): Promise<Hex[]> => [],
});

const buildFakeKeyringV2 = ({
  destroy,
}: FakeKeyringOptions = {}): KeyringV2 => ({
  type: 'hd',
  capabilities: { scopes: ['eip155:1'] },
  ...(destroy ? { destroy } : {}),
  serialize: async (): Promise<Json> => ({}),
  deserialize: async (): Promise<void> => undefined,
  getAccounts: async () => [],
  getAccount: async () => {
    throw new Error('Not implemented');
  },
  createAccounts: async () => [],
  deleteAccount: async (): Promise<void> => undefined,
  submitRequest: async (): Promise<Json> => ({}),
});

const buildEntry = (
  keyring: EthKeyring,
  keyringV2?: KeyringV2,
  metadata: KeyringMetadata = { id: 'keyring-id', name: 'Keyring' },
): KeyringEntry => ({
  keyring,
  ...(keyringV2 ? { keyringV2 } : {}),
  metadata,
});

type MockSessionOptions = {
  keyrings?: KeyringEntry[];
  unsupportedKeyrings?: SerializedKeyring[];
  encryptionKey?: CachedEncryptionKey;
};

const buildMockSession = ({
  keyrings = [],
  unsupportedKeyrings = [],
  encryptionKey,
}: MockSessionOptions = {}): VaultSession => {
  let currentKeyrings = keyrings;
  let currentUnsupportedKeyrings = unsupportedKeyrings;
  let currentEncryptionKey = encryptionKey;

  return {
    getKeyrings: () => [...currentKeyrings],
    replaceKeyrings: (next) => {
      currentKeyrings = next;
    },
    removeKeyring: (entry) => {
      const index = currentKeyrings.indexOf(entry);
      if (index === -1) {
        return false;
      }
      currentKeyrings.splice(index, 1);
      return true;
    },
    insertKeyringAt: (index, entry) => {
      currentKeyrings.splice(index, 0, entry);
    },
    getUnsupportedKeyrings: () => [...currentUnsupportedKeyrings],
    setUnsupportedKeyrings: (next) => {
      currentUnsupportedKeyrings = next;
    },
    parkUnsupportedKeyring: (keyring) => {
      currentUnsupportedKeyrings.push(keyring);
    },
    getEncryptionKey: () => currentEncryptionKey,
    setEncryptionKey: (key) => {
      currentEncryptionKey = key;
    },
  };
};

type MockOperationsOptions = {
  failForType?: string;
};

/** A mocked `VaultOperations.createKeyring`. */
type CreateKeyringMock = Mock<
  (
    type: string,
    data?: unknown,
    metadata?: KeyringMetadata,
  ) => Promise<KeyringEntry>
>;

/** A mocked `VaultOperations.assertNoDuplicateAccounts`. */
type AssertNoDuplicateAccountsMock = Mock<
  (keyrings: EthKeyring[]) => Promise<void>
>;

/** A mocked `VaultOperations.updateVault`. */
type UpdateVaultMock = Mock<() => Promise<boolean>>;

/**
 * The pieces a test needs to drive a transaction: the transaction itself,
 * the mock session behind it, and the mock operations it calls.
 */
type MockTransactionContext = {
  transaction: VaultTransaction;
  session: VaultSession;
  createKeyring: CreateKeyringMock;
  assertNoDuplicateAccounts: AssertNoDuplicateAccountsMock;
  updateVault: UpdateVaultMock;
  observedKeyrings: KeyringEntry[][];
};

const buildMockOperations = (
  session: VaultSession,
  { failForType }: MockOperationsOptions = {},
): {
  operations: VaultOperations;
  createKeyring: CreateKeyringMock;
  assertNoDuplicateAccounts: AssertNoDuplicateAccountsMock;
  updateVault: UpdateVaultMock;
  observedKeyrings: KeyringEntry[][];
} => {
  const observedKeyrings: KeyringEntry[][] = [];

  const createKeyring: CreateKeyringMock = vi.fn(
    async (
      type: string,
      _data?: unknown,
      metadata?: KeyringMetadata,
    ): Promise<KeyringEntry> => {
      // What a lock-free reader would see through the session while the
      // rollback walk recreates keyrings.
      observedKeyrings.push(session.getKeyrings());
      if (type === failForType) {
        throw new Error('Failed to recreate keyring');
      }
      return buildEntry(
        buildFakeKeyring({ type }),
        undefined,
        metadata ?? { id: `recreated-${type}`, name: '' },
      );
    },
  );

  const assertNoDuplicateAccounts: AssertNoDuplicateAccountsMock = vi.fn(
    async (_keyrings: EthKeyring[]): Promise<void> => undefined,
  );

  const updateVault: UpdateVaultMock = vi.fn(
    async (): Promise<boolean> => true,
  );

  const operations: VaultOperations = {
    createKeyring,
    assertNoDuplicateAccounts,
    updateVault,
  };

  return {
    operations,
    createKeyring,
    assertNoDuplicateAccounts,
    updateVault,
    observedKeyrings,
  };
};

const buildTransaction = (
  scope: TransactionScope,
  sessionOptions: MockSessionOptions = {},
  operationsOptions: MockOperationsOptions = {},
): MockTransactionContext => {
  const session = buildMockSession(sessionOptions);
  const {
    operations,
    createKeyring,
    assertNoDuplicateAccounts,
    updateVault,
    observedKeyrings,
  } = buildMockOperations(session, operationsOptions);
  return {
    transaction: new VaultTransaction(scope, session, operations),
    session,
    createKeyring,
    assertNoDuplicateAccounts,
    updateVault,
    observedKeyrings,
  };
};

/**
 * The standard persist policy: persist iff the session state changed.
 *
 * @param hasChanged - Lazily checks whether the session state changed.
 * @returns Whether the vault should be written.
 */
const PERSIST_WHEN_CHANGED: VaultPersistPolicy = (hasChanged) => hasChanged();

const buildWalletTransaction = (
  sessionOptions: MockSessionOptions = {},
  operationsOptions: MockOperationsOptions = {},
  persist: WalletTransactionScope['persist'] = PERSIST_WHEN_CHANGED,
): MockTransactionContext =>
  buildTransaction(
    { type: 'wallet', persist },
    sessionOptions,
    operationsOptions,
  );

describe('VaultTransaction', () => {
  describe('scope', () => {
    it('exposes the wallet scope', () => {
      const persist: WalletTransactionScope['persist'] = () => false;
      const { transaction } = buildTransaction({ type: 'wallet', persist });

      expect(transaction.scope).toStrictEqual({
        type: 'wallet',
        persist,
      });
    });

    it('exposes the keyring scope with its entry and created flag', () => {
      const entry = buildEntry(buildFakeKeyring());
      const { transaction } = buildTransaction({
        type: 'keyring',
        entry,
        created: false,
      });

      expect(transaction.scope).toStrictEqual({
        type: 'keyring',
        entry,
        created: false,
      });
    });
  });

  describe('destroy', () => {
    it('destroys the keyring and its V2 instance', async () => {
      const keyringDestroy = vi.fn(async () => undefined);
      const keyringV2Destroy = vi.fn(async () => undefined);
      const entry = buildEntry(
        buildFakeKeyring({ destroy: keyringDestroy }),
        buildFakeKeyringV2({ destroy: keyringV2Destroy }),
      );
      const { transaction } = buildWalletTransaction();

      await transaction.destroy(entry);

      expect(keyringDestroy).toHaveBeenCalledTimes(1);
      expect(keyringV2Destroy).toHaveBeenCalledTimes(1);
    });

    it('is a no-op for keyrings without a destroy method', async () => {
      const keyring = buildFakeKeyring();
      const entry = buildEntry(keyring);
      const { transaction } = buildWalletTransaction();

      expect(await transaction.destroy(entry)).toBeUndefined();
      expect(transaction.isDestroyed(entry)).toBe(true);
    });

    it('marks the entry as destroyed', async () => {
      const entry = buildEntry(buildFakeKeyring());
      const { transaction } = buildWalletTransaction();

      await transaction.destroy(entry);

      expect(transaction.isDestroyed(entry)).toBe(true);
    });

    it('marks the entry as destroyed even when destruction throws', async () => {
      const entry = buildEntry(
        buildFakeKeyring({
          destroy: async () => {
            throw new Error('destroy failed');
          },
        }),
      );
      const { transaction } = buildWalletTransaction();

      await expect(transaction.destroy(entry)).rejects.toThrow(
        'destroy failed',
      );
      expect(transaction.isDestroyed(entry)).toBe(true);
    });

    it('marks the entry as destroyed when the V1 destruction succeeds but the V2 one throws', async () => {
      const keyringDestroy = vi.fn(async () => undefined);
      const entry = buildEntry(
        buildFakeKeyring({ destroy: keyringDestroy }),
        buildFakeKeyringV2({
          destroy: async () => {
            throw new Error('destroy failed');
          },
        }),
      );
      const { transaction } = buildWalletTransaction();

      await expect(transaction.destroy(entry)).rejects.toThrow(
        'destroy failed',
      );
      expect(keyringDestroy).toHaveBeenCalledTimes(1);
      expect(transaction.isDestroyed(entry)).toBe(true);
    });

    it('propagates destruction errors', async () => {
      const destroy = vi.fn(async () => {
        throw new Error('destroy failed');
      });
      const entry = buildEntry(buildFakeKeyring({ destroy }));
      const { transaction } = buildWalletTransaction();

      await expect(transaction.destroy(entry)).rejects.toThrow(
        'destroy failed',
      );
      expect(destroy).toHaveBeenCalledTimes(1);
    });

    it('logs instead of throwing when errors are ignored', async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      const destroy = vi.fn(async () => {
        throw new Error('destroy failed');
      });
      const entry = buildEntry(buildFakeKeyring({ destroy }));
      const { transaction } = buildWalletTransaction();

      expect(
        await transaction.destroy(entry, { ignoreErrors: true }),
      ).toBeUndefined();
      expect(destroy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.any(Error));
    });

    it('marks the entry as destroyed when destruction throws and errors are ignored', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const entry = buildEntry(
        buildFakeKeyring({
          destroy: async () => {
            throw new Error('destroy failed');
          },
        }),
      );
      const { transaction } = buildWalletTransaction();

      await transaction.destroy(entry, { ignoreErrors: true });

      expect(transaction.isDestroyed(entry)).toBe(true);
    });

    it('does not mark entries it did not destroy', async () => {
      const destroyedEntry = buildEntry(buildFakeKeyring());
      const untouchedEntry = buildEntry(buildFakeKeyring());
      const { transaction } = buildWalletTransaction();

      await transaction.destroy(destroyedEntry);

      expect(transaction.isDestroyed(untouchedEntry)).toBe(false);
    });
  });

  describe('isDestroyed', () => {
    it('returns false for untouched entries', () => {
      const entry = buildEntry(buildFakeKeyring());
      const { transaction } = buildWalletTransaction();

      expect(transaction.isDestroyed(entry)).toBe(false);
    });

    it('tracks destroyed entries per transaction instance', async () => {
      const entry = buildEntry(buildFakeKeyring());
      const { transaction: firstTransaction } = buildWalletTransaction();
      const { transaction: secondTransaction } = buildWalletTransaction();

      await firstTransaction.destroy(entry);

      expect(firstTransaction.isDestroyed(entry)).toBe(true);
      expect(secondTransaction.isDestroyed(entry)).toBe(false);
    });
  });

  describe('begin', () => {
    it('snapshots every keyring of the wallet scope', async () => {
      const serializeA = vi.fn(async (): Promise<Json> => ({ a: true }));
      const serializeB = vi.fn(async (): Promise<Json> => ({ b: true }));
      const entryA = buildEntry(
        buildFakeKeyring({ type: 'A', serialize: serializeA }),
      );
      const entryB = buildEntry(
        buildFakeKeyring({ type: 'B', serialize: serializeB }),
      );
      const { transaction } = buildWalletTransaction({
        keyrings: [entryA, entryB],
      });

      await transaction.begin();

      expect(serializeA).toHaveBeenCalledTimes(1);
      expect(serializeB).toHaveBeenCalledTimes(1);
    });

    it('does not serialize the operated keyring when the keyring-scope transaction created it', async () => {
      const serialize = vi.fn(async (): Promise<Json> => ({}));
      const entry = buildEntry(buildFakeKeyring({ serialize }));
      const { transaction } = buildTransaction({
        type: 'keyring',
        entry,
        created: true,
      });

      await transaction.begin();

      expect(serialize).not.toHaveBeenCalled();
    });

    it('clones the snapshot data, so aliased serialize output cannot corrupt the restore point', async () => {
      const aliased: Json = { mutated: false };
      const entry = buildEntry(
        buildFakeKeyring({ serialize: async () => aliased }),
      );
      const { transaction, createKeyring } = buildTransaction(
        { type: 'keyring', entry, created: false },
        { keyrings: [entry] },
      );

      await transaction.begin();

      // The failed transaction mutates the state the keyring aliases from
      // `serialize()`.
      aliased.mutated = true;

      await transaction.rollback();

      expect(createKeyring).toHaveBeenCalledWith(
        'Fake Keyring',
        { mutated: false },
        { id: 'keyring-id', name: 'Keyring' },
      );
    });
  });

  describe('rollback (wallet scope)', () => {
    it('throws when the transaction was not begun', async () => {
      const { transaction } = buildWalletTransaction();

      await expect(transaction.rollback()).rejects.toThrow('was not begun');
    });

    it('keeps unchanged keyrings as instances, in their position', async () => {
      const entryA = buildEntry(
        buildFakeKeyring({ type: 'A', serialize: async () => ({ a: true }) }),
      );
      const entryB = buildEntry(
        buildFakeKeyring({ type: 'B', serialize: async () => ({ b: true }) }),
      );
      const { transaction, session, createKeyring } = buildWalletTransaction({
        keyrings: [entryA, entryB],
      });
      await transaction.begin();

      await transaction.rollback();

      expect(session.getKeyrings()).toStrictEqual([entryA, entryB]);
      expect(createKeyring).not.toHaveBeenCalled();
    });

    it('rebuilds mutated keyrings in place, destroying the stale instance first', async () => {
      const aData: Json = { a: true };
      const destroyA = vi.fn(async () => undefined);
      const entryA = buildEntry(
        buildFakeKeyring({
          type: 'A',
          serialize: async () => aData,
          destroy: destroyA,
        }),
      );
      const { transaction, session, createKeyring } = buildWalletTransaction({
        keyrings: [entryA],
      });
      await transaction.begin();

      // The failed transaction mutates the keyring.
      aData.a = false;

      await transaction.rollback();

      expect(destroyA).toHaveBeenCalledTimes(1);
      expect(destroyA.mock.invocationCallOrder[0]).toBeLessThan(
        createKeyring.mock.invocationCallOrder[0],
      );
      expect(session.getKeyrings()).toHaveLength(1);
      expect(session.getKeyrings()[0]?.keyring).not.toBe(entryA.keyring);
      expect(createKeyring).toHaveBeenCalledWith(
        'A',
        { a: true },
        { id: 'keyring-id', name: 'Keyring' },
      );
    });

    it('rebuilds keyrings destroyed by the failed transaction, even when their serialized state is unchanged', async () => {
      const destroyA = vi.fn(async () => undefined);
      const entryA = buildEntry(
        buildFakeKeyring({
          type: 'A',
          serialize: async () => ({ a: true }),
          destroy: destroyA,
        }),
      );
      const { transaction, session, createKeyring } = buildWalletTransaction({
        keyrings: [entryA],
      });
      await transaction.begin();

      // The failed transaction destroys the keyring without mutating it.
      await transaction.destroy(entryA);

      await transaction.rollback();

      expect(destroyA).toHaveBeenCalledTimes(2); // Once by the failed transaction, once by the rebuild.
      expect(createKeyring).toHaveBeenCalledTimes(1);
      expect(session.getKeyrings()[0]?.keyring).not.toBe(entryA.keyring);
    });

    it('recreates keyrings removed by the failed transaction, at their original position', async () => {
      const entryA = buildEntry(
        buildFakeKeyring({ type: 'A', serialize: async () => ({ a: true }) }),
      );
      const entryB = buildEntry(
        buildFakeKeyring({ type: 'B', serialize: async () => ({ b: true }) }),
      );
      const { transaction, session, createKeyring } = buildWalletTransaction({
        keyrings: [entryA, entryB],
      });
      await transaction.begin();

      // The failed transaction removes the keyring.
      session.removeKeyring(entryB);

      await transaction.rollback();

      expect(createKeyring).toHaveBeenCalledWith(
        'B',
        { b: true },
        { id: 'keyring-id', name: 'Keyring' },
      );
      expect(session.getKeyrings()).toHaveLength(2);
      expect(session.getKeyrings()[0]).toBe(entryA);
      expect(session.getKeyrings()[1]?.keyring).not.toBe(entryB.keyring);
    });

    it('destroys and drops keyrings created by the failed transaction', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const destroyC = vi.fn(async () => {
        throw new Error('destroy failed');
      });
      const entryA = buildEntry(
        buildFakeKeyring({ type: 'A', serialize: async () => ({ a: true }) }),
      );
      const entryC = buildEntry(
        buildFakeKeyring({ type: 'C', destroy: destroyC }),
      );
      const { transaction, session } = buildWalletTransaction({
        keyrings: [entryA],
      });
      await transaction.begin();

      // The failed transaction creates a keyring, whose destruction fails.
      session.insertKeyringAt(1, entryC);

      await transaction.rollback();

      expect(destroyC).toHaveBeenCalledTimes(1);
      expect(session.getKeyrings()).toStrictEqual([entryA]);
    });

    it('destroys the leftovers before recreating, so a shared resource is released for the recreations', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      // Before the transaction, the keyring holds the shared resource.
      sharedResourceHeld = true;

      const entryA = buildEntry(
        buildFakeKeyring({
          type: 'Shared',
          serialize: async (): Promise<Json> => ({ a: true }),
          destroy: async () => releaseSharedResource(),
        }),
        undefined,
        { id: 'a', name: 'A' },
      );
      const leftoverDestroy = vi.fn(async () => releaseSharedResource());
      const leftoverEntry = buildEntry(
        buildFakeKeyring({ type: 'Shared', destroy: leftoverDestroy }),
        undefined,
        { id: 'leftover', name: 'Leftover' },
      );

      const { transaction, session, createKeyring } = buildWalletTransaction({
        keyrings: [entryA],
      });
      // The recreated keyring acquires the resource on creation, and the
      // acquisition fails while another instance holds it.
      createKeyring.mockImplementation(
        async (
          type: string,
          _data?: unknown,
          metadata?: KeyringMetadata,
        ): Promise<KeyringEntry> => {
          acquireSharedResource();
          return buildEntry(buildFakeKeyring({ type }), undefined, metadata);
        },
      );
      await transaction.begin();

      // The failed transaction removes the keyring — releasing the
      // resource — and its own replacement instance takes it over.
      await transaction.remove(entryA);
      session.insertKeyringAt(0, leftoverEntry);
      sharedResourceHeld = true;

      await transaction.rollback();

      // The leftover was destroyed before the recreation, releasing the
      // resource for it instead of blocking it: the keyring is recreated
      // from its snapshot, not parked as unsupported and dropped.
      expect(leftoverDestroy).toHaveBeenCalledTimes(1);
      expect(createKeyring).toHaveBeenCalledTimes(1);
      expect(createKeyring).toHaveBeenCalledWith(
        'Shared',
        { a: true },
        { id: 'a', name: 'A' },
      );
      const keyrings = session.getKeyrings();
      expect(keyrings).toHaveLength(1);
      expect(keyrings[0]?.keyring).not.toBe(entryA.keyring);
      expect(session.getUnsupportedKeyrings()).toStrictEqual([]);
    });

    it('restores the unsupported keyrings wholesale, parking the keyrings it fails to recreate', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const entryA = buildEntry(
        buildFakeKeyring({ type: 'A', serialize: async () => ({ a: true }) }),
      );
      const entryB = buildEntry(
        buildFakeKeyring({ type: 'B', serialize: async () => ({ b: true }) }),
      );
      const unsupported: SerializedKeyring = {
        type: 'Unsupported',
        data: {},
        metadata: { id: 'unsupported', name: '' },
      };
      const { transaction, session, createKeyring } = buildWalletTransaction(
        { keyrings: [entryA, entryB], unsupportedKeyrings: [unsupported] },
        { failForType: 'B' },
      );
      await transaction.begin();

      // The failed transaction parks a rogue keyring as unsupported.
      session.parkUnsupportedKeyring({
        type: 'Rogue',
        data: {},
      });
      // And removes B, whose recreation will fail.
      session.removeKeyring(entryB);

      await transaction.rollback();

      expect(createKeyring).toHaveBeenCalledWith(
        'B',
        { b: true },
        { id: 'keyring-id', name: 'Keyring' },
      );
      expect(session.getUnsupportedKeyrings()).toStrictEqual([
        unsupported,
        // B, parked by the failed recreation, without its snapshot position.
        {
          type: 'B',
          data: { b: true },
          metadata: { id: 'keyring-id', name: 'Keyring' },
        },
      ]);
      expect(session.getKeyrings()).toStrictEqual([entryA]);
    });

    it('restores the encryption key', async () => {
      const entryA = buildEntry(
        buildFakeKeyring({ type: 'A', serialize: async () => ({ a: true }) }),
      );
      const { transaction, session } = buildWalletTransaction({
        keyrings: [entryA],
        encryptionKey: FIRST_ENCRYPTION_KEY,
      });
      await transaction.begin();

      // The failed transaction rotates the encryption key.
      session.setEncryptionKey(SECOND_ENCRYPTION_KEY);

      await transaction.rollback();

      expect(session.getEncryptionKey()).toStrictEqual(FIRST_ENCRYPTION_KEY);
    });

    it('replaces the keyrings once at the end, never exposing a partially reconciled list', async () => {
      const aData: Json = { a: true };
      const bData: Json = { b: true };
      const entryA = buildEntry(
        buildFakeKeyring({
          type: 'A',
          serialize: async () => aData,
        }),
      );
      const entryB = buildEntry(
        buildFakeKeyring({ type: 'B', serialize: async () => bData }),
      );
      const { transaction, session, observedKeyrings } = buildWalletTransaction(
        { keyrings: [entryA, entryB] },
      );
      await transaction.begin();

      // The failed transaction mutates both keyrings, so the rollback
      // rebuilds both, in walk order.
      aData.a = false;
      bData.b = false;

      await transaction.rollback();

      // Every read during the walk saw the full pre-rollback list — never
      // the partially reconciled one.
      expect(observedKeyrings).toHaveLength(2);
      for (const observed of observedKeyrings) {
        expect(observed).toStrictEqual([entryA, entryB]);
      }
      const keyrings = session.getKeyrings();
      expect(keyrings).toHaveLength(2);
      expect(keyrings[0]?.keyring).not.toBe(entryA.keyring);
      expect(keyrings[1]?.keyring).not.toBe(entryB.keyring);
    });

    it('checks recreated keyrings for duplicates against the reconciled-so-far list', async () => {
      const entryA = buildEntry(
        buildFakeKeyring({ type: 'A', serialize: async () => ({ a: true }) }),
      );
      const entryB = buildEntry(
        buildFakeKeyring({ type: 'B', serialize: async () => ({ b: true }) }),
      );
      const { transaction, session, assertNoDuplicateAccounts } =
        buildWalletTransaction({
          keyrings: [entryA, entryB],
        });
      await transaction.begin();

      // The failed transaction mutates B; A is kept as-is by the walk.
      vi.spyOn(entryB.keyring, 'serialize').mockImplementation(async () => ({
        b: false,
      }));

      await transaction.rollback();

      const keyrings = session.getKeyrings();
      expect(assertNoDuplicateAccounts).toHaveBeenCalledTimes(1);
      expect(assertNoDuplicateAccounts).toHaveBeenCalledWith([
        entryA.keyring,
        keyrings[1]?.keyring,
      ]);
    });
  });

  describe('rollback (keyring scope)', () => {
    it('throws when the transaction was not begun and did not create the keyring', async () => {
      const entry = buildEntry(buildFakeKeyring());
      const { transaction } = buildTransaction({
        type: 'keyring',
        entry,
        created: false,
      });

      await expect(transaction.rollback()).rejects.toThrow('was not begun');
    });

    it('destroys and drops a keyring the transaction created, even when destruction fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const destroy = vi.fn(async () => {
        throw new Error('destroy failed');
      });
      const entry = buildEntry(
        buildFakeKeyring({ type: 'A', destroy }),
        undefined,
        { id: 'a', name: 'A' },
      );
      const other = buildEntry(buildFakeKeyring({ type: 'Other' }));
      const { transaction, session } = buildTransaction(
        { type: 'keyring', entry, created: true },
        { keyrings: [other, entry] },
      );
      await transaction.begin();

      await transaction.rollback();

      expect(destroy).toHaveBeenCalledTimes(1);
      expect(session.getKeyrings()).toStrictEqual([other]);
    });

    it('recreates a keyring the transaction removed, at its original position', async () => {
      const entry = buildEntry(
        buildFakeKeyring({ type: 'A', serialize: async () => ({ a: true }) }),
        undefined,
        { id: 'a', name: 'A' },
      );
      const other = buildEntry(buildFakeKeyring({ type: 'Other' }));
      const { transaction, session, createKeyring } = buildTransaction(
        { type: 'keyring', entry, created: false },
        { keyrings: [entry, other] },
      );
      await transaction.begin();

      // The transaction removes the operated keyring.
      session.removeKeyring(entry);

      await transaction.rollback();

      expect(createKeyring).toHaveBeenCalledWith(
        'A',
        { a: true },
        { id: 'a', name: 'A' },
      );
      expect(session.getKeyrings()).toHaveLength(2);
      expect(session.getKeyrings()[0]?.keyring).not.toBe(entry.keyring);
      expect(session.getKeyrings()[1]).toBe(other);
    });

    it('always rebuilds the operated keyring on failure, even when unchanged, in place', async () => {
      const destroy = vi.fn(async () => undefined);
      const entry = buildEntry(
        buildFakeKeyring({
          type: 'A',
          serialize: async () => ({ a: true }),
          destroy,
        }),
        undefined,
        { id: 'a', name: 'A' },
      );
      const other = buildEntry(buildFakeKeyring({ type: 'Other' }));
      const { transaction, session, createKeyring } = buildTransaction(
        { type: 'keyring', entry, created: false },
        { keyrings: [other, entry] },
      );
      await transaction.begin();

      await transaction.rollback();

      expect(destroy).toHaveBeenCalledTimes(1);
      expect(destroy.mock.invocationCallOrder[0]).toBeLessThan(
        createKeyring.mock.invocationCallOrder[0],
      );
      expect(createKeyring).toHaveBeenCalledWith(
        'A',
        { a: true },
        { id: 'a', name: 'A' },
      );
      expect(session.getKeyrings()).toHaveLength(2);
      expect(session.getKeyrings()[0]).toBe(other);
      expect(session.getKeyrings()[1]?.keyring).not.toBe(entry.keyring);
    });

    it('does not check for duplicate accounts when recreating the operated keyring', async () => {
      const entry = buildEntry(
        buildFakeKeyring({ type: 'A', serialize: async () => ({ a: true }) }),
      );
      const { transaction, assertNoDuplicateAccounts } = buildTransaction(
        { type: 'keyring', entry, created: false },
        { keyrings: [entry] },
      );
      await transaction.begin();

      await transaction.rollback();

      expect(assertNoDuplicateAccounts).not.toHaveBeenCalled();
    });

    it('parks the keyring as unsupported when its recreation fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const entry = buildEntry(
        buildFakeKeyring({ type: 'A', serialize: async () => ({ a: true }) }),
        undefined,
        { id: 'a', name: 'A' },
      );
      const { transaction, session } = buildTransaction(
        { type: 'keyring', entry, created: false },
        { keyrings: [entry] },
        { failForType: 'A' },
      );
      await transaction.begin();

      await transaction.rollback();

      expect(session.getKeyrings()).toStrictEqual([]);
      expect(session.getUnsupportedKeyrings()).toStrictEqual([
        { type: 'A', data: { a: true }, metadata: { id: 'a', name: 'A' } },
      ]);
    });
  });

  describe('hasChanged', () => {
    describe('wallet scope', () => {
      it('reports no change for an unchanged session', async () => {
        const entryA = buildEntry(
          buildFakeKeyring({
            type: 'A',
            serialize: async (): Promise<Json> => ({ a: true }),
          }),
        );
        const entryB = buildEntry(
          buildFakeKeyring({
            type: 'B',
            serialize: async (): Promise<Json> => ({ b: true }),
          }),
        );
        const { transaction } = buildWalletTransaction({
          keyrings: [entryA, entryB],
          encryptionKey: FIRST_ENCRYPTION_KEY,
        });
        await transaction.begin();

        expect(await transaction.hasChanged()).toBe(false);
      });

      it('reports a change when a keyring was mutated', async () => {
        const aData: Json = { a: true };
        const entryA = buildEntry(
          buildFakeKeyring({ type: 'A', serialize: async () => aData }),
        );
        const { transaction } = buildWalletTransaction({
          keyrings: [entryA],
        });
        await transaction.begin();

        aData.a = false;

        expect(await transaction.hasChanged()).toBe(true);
      });

      it('reports a change when a keyring was created', async () => {
        const entryA = buildEntry(
          buildFakeKeyring({
            type: 'A',
            serialize: async (): Promise<Json> => ({ a: true }),
          }),
        );
        const createdEntry = buildEntry(
          buildFakeKeyring({
            type: 'C',
            serialize: async (): Promise<Json> => ({ c: true }),
          }),
        );
        const { transaction, session } = buildWalletTransaction({
          keyrings: [entryA],
        });
        await transaction.begin();

        session.insertKeyringAt(1, createdEntry);

        expect(await transaction.hasChanged()).toBe(true);
      });

      it('reports a change when a keyring was removed', async () => {
        const entryA = buildEntry(
          buildFakeKeyring({
            type: 'A',
            serialize: async (): Promise<Json> => ({ a: true }),
          }),
        );
        const entryB = buildEntry(
          buildFakeKeyring({
            type: 'B',
            serialize: async (): Promise<Json> => ({ b: true }),
          }),
        );
        const { transaction, session } = buildWalletTransaction({
          keyrings: [entryA, entryB],
        });
        await transaction.begin();

        session.removeKeyring(entryB);

        expect(await transaction.hasChanged()).toBe(true);
      });

      it('reports a change when the encryption key was changed', async () => {
        const entryA = buildEntry(
          buildFakeKeyring({
            type: 'A',
            serialize: async (): Promise<Json> => ({ a: true }),
          }),
        );
        const { transaction, session } = buildWalletTransaction({
          keyrings: [entryA],
          encryptionKey: FIRST_ENCRYPTION_KEY,
        });
        await transaction.begin();

        session.setEncryptionKey(SECOND_ENCRYPTION_KEY);

        expect(await transaction.hasChanged()).toBe(true);
      });

      it('reports a change when the unsupported keyrings were changed', async () => {
        const entryA = buildEntry(
          buildFakeKeyring({
            type: 'A',
            serialize: async (): Promise<Json> => ({ a: true }),
          }),
        );
        const { transaction, session } = buildWalletTransaction({
          keyrings: [entryA],
        });
        await transaction.begin();

        session.parkUnsupportedKeyring({ type: 'Rogue', data: {} });

        expect(await transaction.hasChanged()).toBe(true);
      });

      it('reports a change when a keyring was renamed', async () => {
        const entryA = buildEntry(
          buildFakeKeyring({
            type: 'A',
            serialize: async (): Promise<Json> => ({ a: true }),
          }),
          undefined,
          { id: 'a', name: 'Old name' },
        );
        const { transaction } = buildWalletTransaction({
          keyrings: [entryA],
        });
        await transaction.begin();

        entryA.metadata.name = 'New name';

        expect(await transaction.hasChanged()).toBe(true);
      });
    });

    it('reports a change for a created keyring that still exists', async () => {
      const entry = buildEntry(buildFakeKeyring());
      const { transaction } = buildTransaction(
        { type: 'keyring', entry, created: true },
        { keyrings: [entry] },
      );
      await transaction.begin();

      expect(await transaction.hasChanged()).toBe(true);
    });

    it('reports no change for a created keyring the transaction removed', async () => {
      const entry = buildEntry(buildFakeKeyring());
      const { transaction, session } = buildTransaction(
        { type: 'keyring', entry, created: true },
        { keyrings: [entry] },
      );
      await transaction.begin();

      session.removeKeyring(entry);

      expect(await transaction.hasChanged()).toBe(false);
    });

    it('reports a change when the operated keyring was removed', async () => {
      const entry = buildEntry(buildFakeKeyring());
      const { transaction, session } = buildTransaction(
        { type: 'keyring', entry, created: false },
        { keyrings: [entry] },
      );
      await transaction.begin();

      session.removeKeyring(entry);

      expect(await transaction.hasChanged()).toBe(true);
    });

    it('reports no change when the operated keyring is unchanged', async () => {
      const entry = buildEntry(
        buildFakeKeyring({ serialize: async () => ({ a: true }) }),
      );
      const { transaction } = buildTransaction(
        { type: 'keyring', entry, created: false },
        { keyrings: [entry] },
      );
      await transaction.begin();

      expect(await transaction.hasChanged()).toBe(false);
    });

    it('reports a change when the operated keyring was mutated', async () => {
      const aData: Json = { a: true };
      const entry = buildEntry(
        buildFakeKeyring({ serialize: async () => aData }),
      );
      const { transaction } = buildTransaction(
        { type: 'keyring', entry, created: false },
        { keyrings: [entry] },
      );
      await transaction.begin();

      aData.a = false;

      expect(await transaction.hasChanged()).toBe(true);
    });

    it('reports a change when the operated keyring was destroyed', async () => {
      const entry = buildEntry(
        buildFakeKeyring({ serialize: async () => ({ a: true }) }),
      );
      const { transaction } = buildTransaction(
        { type: 'keyring', entry, created: false },
        { keyrings: [entry] },
      );
      await transaction.begin();

      await transaction.destroy(entry);

      expect(await transaction.hasChanged()).toBe(true);
    });
  });

  describe('commit', () => {
    describe('wallet scope', () => {
      it('persists the vault when the session changed', async () => {
        const aData: Json = { a: true };
        const entryA = buildEntry(
          buildFakeKeyring({ type: 'A', serialize: async () => aData }),
        );
        const { transaction, updateVault } = buildWalletTransaction({
          keyrings: [entryA],
        });
        await transaction.begin();

        aData.a = false;

        await transaction.commit();

        expect(updateVault).toHaveBeenCalledTimes(1);
      });

      it('does not persist the vault when the session is unchanged', async () => {
        const entryA = buildEntry(
          buildFakeKeyring({
            type: 'A',
            serialize: async (): Promise<Json> => ({ a: true }),
          }),
        );
        const { transaction, updateVault } = buildWalletTransaction({
          keyrings: [entryA],
        });
        await transaction.begin();

        await transaction.commit();

        expect(updateVault).not.toHaveBeenCalled();
      });

      it('persists the vault when the policy forces the write', async () => {
        const entryA = buildEntry(
          buildFakeKeyring({
            type: 'A',
            serialize: async (): Promise<Json> => ({ a: true }),
          }),
        );
        const { transaction, updateVault } = buildWalletTransaction(
          { keyrings: [entryA] },
          {},
          () => true,
        );
        await transaction.begin();

        await transaction.commit();

        expect(updateVault).toHaveBeenCalledTimes(1);
      });

      it('does not persist the vault when the policy declines', async () => {
        const aData: Json = { a: true };
        const entryA = buildEntry(
          buildFakeKeyring({ type: 'A', serialize: async () => aData }),
        );
        const { transaction, updateVault } = buildWalletTransaction(
          { keyrings: [entryA] },
          {},
          () => false,
        );
        await transaction.begin();

        aData.a = false;

        await transaction.commit();

        expect(updateVault).not.toHaveBeenCalled();
      });

      it('does not evaluate the session change when the policy ignores it', async () => {
        const serializeA = vi.fn(async (): Promise<Json> => ({ a: true }));
        const entryA = buildEntry(
          buildFakeKeyring({ type: 'A', serialize: serializeA }),
        );
        const { transaction } = buildWalletTransaction(
          { keyrings: [entryA] },
          {},
          () => false,
        );
        await transaction.begin();

        // Only `begin()` serialized the keyring: the declined commit never
        // evaluated the session change.
        expect(serializeA).toHaveBeenCalledTimes(1);

        await transaction.commit();

        expect(serializeA).toHaveBeenCalledTimes(1);
      });

      it('rejects when the policy throws', async () => {
        const entryA = buildEntry(buildFakeKeyring({ type: 'A' }));
        const { transaction } = buildWalletTransaction(
          { keyrings: [entryA] },
          {},
          () => {
            throw new Error('policy failed');
          },
        );
        await transaction.begin();

        await expect(transaction.commit()).rejects.toThrow('policy failed');
      });
    });

    describe('keyring scope', () => {
      it('persists the vault when the operated keyring changed', async () => {
        const aData: Json = { a: true };
        const entry = buildEntry(
          buildFakeKeyring({ type: 'A', serialize: async () => aData }),
        );
        const { transaction, updateVault } = buildTransaction(
          { type: 'keyring', entry, created: false },
          { keyrings: [entry] },
        );
        await transaction.begin();

        aData.a = false;

        await transaction.commit();

        expect(updateVault).toHaveBeenCalledTimes(1);
      });

      it('does not persist the vault when the operated keyring is unchanged', async () => {
        const entry = buildEntry(
          buildFakeKeyring({
            type: 'A',
            serialize: async (): Promise<Json> => ({ a: true }),
          }),
        );
        const { transaction, updateVault } = buildTransaction(
          { type: 'keyring', entry, created: false },
          { keyrings: [entry] },
        );
        await transaction.begin();

        await transaction.commit();

        expect(updateVault).not.toHaveBeenCalled();
      });
    });
  });

  describe('remove', () => {
    it('removes a registered entry from the session, destroying it', async () => {
      const destroy = vi.fn(async () => undefined);
      const entry = buildEntry(
        buildFakeKeyring({ type: 'A', destroy }),
        undefined,
        { id: 'a', name: 'A' },
      );
      const other = buildEntry(buildFakeKeyring({ type: 'Other' }));
      const { transaction, session } = buildTransaction(
        { type: 'keyring', entry, created: false },
        { keyrings: [other, entry] },
      );
      await transaction.begin();

      await transaction.remove(entry);

      expect(destroy).toHaveBeenCalledTimes(1);
      expect(session.getKeyrings()).toStrictEqual([other]);
      expect(transaction.isDestroyed(entry)).toBe(true);
    });

    it('is a no-op for an unregistered entry, destroying nothing', async () => {
      const destroy = vi.fn(async () => undefined);
      const entry = buildEntry(
        buildFakeKeyring({ type: 'A', destroy }),
        undefined,
        { id: 'a', name: 'A' },
      );
      const other = buildEntry(buildFakeKeyring({ type: 'Other' }));
      const { transaction, session } = buildTransaction(
        { type: 'keyring', entry, created: false },
        { keyrings: [other] },
      );
      await transaction.begin();

      await transaction.remove(entry);

      expect(destroy).not.toHaveBeenCalled();
      expect(session.getKeyrings()).toStrictEqual([other]);
    });

    it('removes the entry even when its destruction fails', async () => {
      const entry = buildEntry(
        buildFakeKeyring({
          type: 'A',
          destroy: async () => {
            throw new Error('destroy failed');
          },
        }),
        undefined,
        { id: 'a', name: 'A' },
      );
      const other = buildEntry(buildFakeKeyring({ type: 'Other' }));
      const { transaction, session } = buildTransaction(
        { type: 'keyring', entry, created: false },
        { keyrings: [other, entry] },
      );
      await transaction.begin();

      await expect(transaction.remove(entry)).rejects.toThrow('destroy failed');

      expect(session.getKeyrings()).toStrictEqual([other]);
      expect(transaction.isDestroyed(entry)).toBe(true);
    });
  });
});
