import type {
  FetchedSecretDataItem,
  ToprfSecureBackup,
} from '@metamask/toprf-secure-backup';
import {
  EncAccountDataType,
  TOPRFError,
  TOPRFErrorCode,
} from '@metamask/toprf-secure-backup';
import { bigIntToHex, stringToBytes } from '@metamask/utils';
import type { Mock } from 'vitest';
import { describe, expect, it, vi } from 'vitest';

import {
  deriveKeyPair,
  deriveTestEnvelopeKeys,
} from '../../tests/mocks/envelopeKeys.js';
import { SeedlessOnboardingControllerErrorMessage } from '../constants.js';
import {
  packEnvelope,
  serializeControlRecord,
  serializeEnvelope,
} from './envelope-keys.js';
import type { ControlRecord, VaultKeySet } from './envelope-keys.js';
import { EnvelopeStore } from './EnvelopeStore.js';

/**
 * @param fill - Byte fill used to produce distinct vault key sets.
 * @returns A deterministic vault key set.
 */
function createVaultKeySet(fill = 1): VaultKeySet {
  return {
    authKeyPair: deriveKeyPair(new Uint8Array(32).fill(fill)),
    encKey: new Uint8Array(32).fill(fill + 1),
    localWrapKey: new Uint8Array(32).fill(fill + 2),
  };
}

const vaultKeySet: VaultKeySet = createVaultKeySet(1);
const envelopeKeys = deriveTestEnvelopeKeys(new Uint8Array(32).fill(4));

/**
 * @param seq - The record sequence number.
 * @returns A control record.
 */
function createRecord(seq: number): ControlRecord {
  return {
    v: 1,
    seq,
    passwordNamespace: {
      verifier: 'verifier',
      verifierId: 'user',
      authSk: bigIntToHex(vaultKeySet.authKeyPair.sk),
      keyIndex: seq,
    },
    migratedAt: 1,
  };
}

/**
 * @param data - The item data.
 * @param overrides - Item fields to override.
 * @returns A fetched envelope item.
 */
function createItem(
  data: Uint8Array,
  overrides: Partial<FetchedSecretDataItem> = {},
): FetchedSecretDataItem {
  return {
    itemId: 'item',
    dataType: EncAccountDataType.KeyEnvelope,
    data,
    version: 'v2',
    ...overrides,
  };
}

type MockToprfClient = {
  addSecretDataItem: Mock<ToprfSecureBackup['addSecretDataItem']>;
  batchAddSecretDataItems: Mock<ToprfSecureBackup['batchAddSecretDataItems']>;
  fetchAllSecretDataItems: Mock<ToprfSecureBackup['fetchAllSecretDataItems']>;
};

/**
 * @returns A store backed by a mock TOPRF client.
 */
function createStore(): {
  store: EnvelopeStore;
  toprfClient: MockToprfClient;
} {
  const toprfClient: MockToprfClient = {
    addSecretDataItem: vi.fn().mockResolvedValue(undefined),
    batchAddSecretDataItems: vi.fn().mockResolvedValue(undefined),
    fetchAllSecretDataItems: vi.fn().mockResolvedValue([]),
  };
  const store = new EnvelopeStore({
    getToprfClient: (): ToprfSecureBackup =>
      toprfClient as unknown as ToprfSecureBackup,
  });
  return { store, toprfClient };
}

describe('EnvelopeStore', () => {
  describe('envelopes', () => {
    it('adds an envelope to its partition', async () => {
      const { store, toprfClient } = createStore();
      const envelope = packEnvelope('recovery-secret', vaultKeySet);

      await store.writeEnvelope(envelopeKeys, envelope);

      expect(toprfClient.addSecretDataItem).toHaveBeenCalledWith({
        encKey: envelopeKeys.wrapKey,
        authKeyPair: envelopeKeys.authKeyPair,
        secretData: serializeEnvelope(envelope),
        dataType: EncAccountDataType.KeyEnvelope,
      });
    });

    it('fetches the envelopes of a path, newest first', async () => {
      const { store, toprfClient } = createStore();
      const older = packEnvelope('password', createVaultKeySet(1));
      const newer = packEnvelope('password', createVaultKeySet(4));
      const otherPath = packEnvelope('recovery-secret', createVaultKeySet(7));
      toprfClient.fetchAllSecretDataItems.mockResolvedValue([
        createItem(serializeEnvelope(newer), { createdAt: '2000' }),
        createItem(serializeEnvelope(older), { createdAt: '1000' }),
        createItem(serializeEnvelope(otherPath), { createdAt: '3000' }),
      ]);

      expect(
        await store.fetchEnvelopes(envelopeKeys, 'password'),
      ).toStrictEqual([newer, older]);
      expect(toprfClient.fetchAllSecretDataItems).toHaveBeenCalledWith({
        decKey: envelopeKeys.wrapKey,
        authKeyPair: envelopeKeys.authKeyPair,
      });
    });

    it('orders envelopes by Cassandra TIMEUUID creation time newest first regardless of input order', async () => {
      const { store, toprfClient } = createStore();
      const oldest = packEnvelope('password', createVaultKeySet(1));
      const middle = packEnvelope('password', createVaultKeySet(4));
      const newest = packEnvelope('password', createVaultKeySet(7));
      toprfClient.fetchAllSecretDataItems.mockResolvedValue([
        createItem(serializeEnvelope(newest), {
          createdAt: 'b2649610-d1ce-11f0-9878-3be4d8d3a8a0',
        }),
        createItem(serializeEnvelope(oldest), {
          createdAt: 'c14cc4a0-d1cd-11f0-9878-3be4d8d3a8a0',
        }),
        createItem(serializeEnvelope(middle), {
          createdAt: '04e72250-d1ce-11f0-9878-3be4d8d3a8a0',
        }),
      ]);

      expect(
        await store.fetchEnvelopes(envelopeKeys, 'password'),
      ).toStrictEqual([newest, middle, oldest]);
    });

    it('orders items by ISO creation time, then by later position', async () => {
      const { store, toprfClient } = createStore();
      const [first, second, third] = [1, 4, 7].map((fill) =>
        packEnvelope('password', createVaultKeySet(fill)),
      );
      toprfClient.fetchAllSecretDataItems.mockResolvedValue([
        createItem(serializeEnvelope(first)),
        createItem(serializeEnvelope(second)),
        createItem(serializeEnvelope(third), {
          createdAt: '2026-01-01T00:00:00Z',
        }),
      ]);

      expect(
        await store.fetchEnvelopes(envelopeKeys, 'password'),
      ).toStrictEqual([third, second, first]);
    });

    it('treats an unparseable creation time as unknown', async () => {
      const { store, toprfClient } = createStore();
      const [first, second] = [1, 4].map((fill) =>
        packEnvelope('password', createVaultKeySet(fill)),
      );
      toprfClient.fetchAllSecretDataItems.mockResolvedValue([
        createItem(serializeEnvelope(first), { createdAt: 'not-a-date' }),
        createItem(serializeEnvelope(second)),
      ]);

      expect(
        await store.fetchEnvelopes(envelopeKeys, 'password'),
      ).toStrictEqual([second, first]);
    });

    it('skips items of other types and malformed envelopes', async () => {
      const { store, toprfClient } = createStore();
      const envelope = packEnvelope('password', vaultKeySet);
      toprfClient.fetchAllSecretDataItems.mockResolvedValue([
        createItem(stringToBytes('x'), {
          dataType: EncAccountDataType.PrimarySrp,
        }),
        createItem(stringToBytes('garbage')),
        createItem(serializeEnvelope(envelope)),
      ]);

      expect(
        await store.fetchEnvelopes(envelopeKeys, 'password'),
      ).toStrictEqual([envelope]);
    });

    it('throws InvalidEnvelope when KeyEnvelope items are present but none parse', async () => {
      const { store, toprfClient } = createStore();
      toprfClient.fetchAllSecretDataItems.mockResolvedValue([
        createItem(stringToBytes('garbage')),
        createItem(
          stringToBytes(
            JSON.stringify({ ...packEnvelope('password', vaultKeySet), v: 2 }),
          ),
        ),
      ]);

      await expect(
        store.fetchEnvelopes(envelopeKeys, 'password'),
      ).rejects.toThrow(
        SeedlessOnboardingControllerErrorMessage.InvalidEnvelope,
      );
    });

    it('throws InvalidEnvelope when KeyEnvelope items only belong to another path', async () => {
      const { store, toprfClient } = createStore();
      const wrongPath = packEnvelope('recovery-secret', vaultKeySet);
      toprfClient.fetchAllSecretDataItems.mockResolvedValue([
        createItem(serializeEnvelope(wrongPath)),
      ]);

      await expect(
        store.fetchEnvelopes(envelopeKeys, 'password'),
      ).rejects.toThrow(
        SeedlessOnboardingControllerErrorMessage.InvalidEnvelope,
      );
    });

    it('returns no envelopes when only non-envelope items exist', async () => {
      const { store, toprfClient } = createStore();
      toprfClient.fetchAllSecretDataItems.mockResolvedValue([
        createItem(stringToBytes('x'), {
          dataType: EncAccountDataType.PrimarySrp,
        }),
      ]);

      expect(
        await store.fetchEnvelopes(envelopeKeys, 'password'),
      ).toStrictEqual([]);
    });

    it('returns no envelopes for an empty partition', async () => {
      const { store } = createStore();

      expect(
        await store.fetchEnvelopes(envelopeKeys, 'password'),
      ).toStrictEqual([]);
    });

    it('throws fetch errors rather than reporting the envelopes absent', async () => {
      const { store, toprfClient } = createStore();
      toprfClient.fetchAllSecretDataItems.mockRejectedValue(
        new Error('network'),
      );

      await expect(
        store.fetchEnvelopes(envelopeKeys, 'password'),
      ).rejects.toThrow(
        SeedlessOnboardingControllerErrorMessage.FailedToFetchSecretMetadata,
      );
    });

    it('rethrows auth token errors as-is', async () => {
      const { store, toprfClient } = createStore();
      const error = new TOPRFError(TOPRFErrorCode.AuthTokenExpired, 'expired');
      toprfClient.fetchAllSecretDataItems.mockRejectedValue(error);

      await expect(store.fetchEnvelopes(envelopeKeys, 'password')).rejects.toBe(
        error,
      );
    });
  });

  describe('control records', () => {
    it('adds a control record to the vault partition under K_v and the held lock', async () => {
      const { store, toprfClient } = createStore();
      const record = createRecord(1);

      await store.writeControlRecord(vaultKeySet, record, 'held-lock-id');

      expect(toprfClient.batchAddSecretDataItems).toHaveBeenCalledWith({
        secretData: [
          {
            data: serializeControlRecord(record),
            dataType: EncAccountDataType.EnvelopeControl,
          },
        ],
        encKey: vaultKeySet.encKey,
        authKeyPair: vaultKeySet.authKeyPair,
        lockId: 'held-lock-id',
      });
      expect(toprfClient.addSecretDataItem).not.toHaveBeenCalled();
    });

    it('fetches control records from the vault partition, ignoring secret and envelope items', async () => {
      const { store, toprfClient } = createStore();
      const envelope = packEnvelope('password', vaultKeySet);
      toprfClient.fetchAllSecretDataItems.mockResolvedValue([
        createItem(stringToBytes('srp'), {
          dataType: EncAccountDataType.PrimarySrp,
        }),
        createItem(serializeControlRecord(createRecord(1)), {
          dataType: EncAccountDataType.EnvelopeControl,
        }),
        createItem(stringToBytes('legacy'), { dataType: undefined }),
        createItem(serializeEnvelope(envelope)),
      ]);

      expect(await store.fetchControlRecords(vaultKeySet)).toStrictEqual([
        createRecord(1),
      ]);
      expect(toprfClient.fetchAllSecretDataItems).toHaveBeenCalledWith({
        decKey: vaultKeySet.encKey,
        authKeyPair: vaultKeySet.authKeyPair,
      });
    });

    it('fetches the well-formed control records, newest first', async () => {
      const { store, toprfClient } = createStore();
      toprfClient.fetchAllSecretDataItems.mockResolvedValue([
        createItem(serializeControlRecord(createRecord(1)), {
          dataType: EncAccountDataType.EnvelopeControl,
        }),
        createItem(stringToBytes('garbage'), {
          dataType: EncAccountDataType.EnvelopeControl,
        }),
        createItem(serializeControlRecord(createRecord(2)), {
          dataType: EncAccountDataType.EnvelopeControl,
        }),
      ]);

      expect(await store.fetchControlRecords(vaultKeySet)).toStrictEqual([
        createRecord(2),
        createRecord(1),
      ]);
    });

    it('returns no records when the vault has none', async () => {
      const { store } = createStore();

      expect(await store.fetchControlRecords(vaultKeySet)).toStrictEqual([]);
    });

    it('fetches secret items and well-formed control records together', async () => {
      const { store, toprfClient } = createStore();
      const secretItem = createItem(stringToBytes('srp'), {
        dataType: EncAccountDataType.PrimarySrp,
      });
      const legacyItem = createItem(stringToBytes('legacy'), {
        dataType: undefined,
      });
      const envelope = packEnvelope('password', vaultKeySet);
      toprfClient.fetchAllSecretDataItems.mockResolvedValue([
        secretItem,
        createItem(serializeControlRecord(createRecord(1)), {
          dataType: EncAccountDataType.EnvelopeControl,
        }),
        createItem(stringToBytes('garbage'), {
          dataType: EncAccountDataType.EnvelopeControl,
        }),
        legacyItem,
        createItem(serializeEnvelope(envelope)),
      ]);

      expect(await store.fetchVaultItems(vaultKeySet)).toStrictEqual({
        secretItems: [secretItem, legacyItem],
        controlRecords: [createRecord(1)],
      });
    });
  });
});
