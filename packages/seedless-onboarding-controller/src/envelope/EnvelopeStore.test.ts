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

import { deriveTestEnvelopeKeys } from '../../tests/mocks/envelopeKeys.js';
import { SeedlessOnboardingControllerErrorMessage } from '../constants.js';
import {
  deriveControlKeys,
  deriveKeyPair,
  sealEnvelope,
  serializeControlRecord,
  serializeEnvelope,
} from './envelope-keys.js';
import type { ControlRecord, VaultKeySet } from './envelope-keys.js';
import { EnvelopeStore } from './EnvelopeStore.js';

const vaultKeySet: VaultKeySet = {
  authKeyPair: deriveKeyPair(new Uint8Array(32).fill(1)),
  encKey: new Uint8Array(32).fill(2),
  localWrapKey: new Uint8Array(32).fill(3),
};
const envelopeKeys = deriveTestEnvelopeKeys(new Uint8Array(32).fill(4));
const controlKeys = deriveControlKeys(vaultKeySet);

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
      enabled: true,
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
      const envelope = await sealEnvelope(
        envelopeKeys.wrapKey,
        'recovery-secret',
        vaultKeySet,
      );

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
      const older = await sealEnvelope(
        envelopeKeys.wrapKey,
        'password',
        vaultKeySet,
      );
      const newer = await sealEnvelope(
        envelopeKeys.wrapKey,
        'password',
        vaultKeySet,
      );
      const otherPath = await sealEnvelope(
        envelopeKeys.wrapKey,
        'recovery-secret',
        vaultKeySet,
      );
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

    it('orders items by ISO creation time, then by later position', async () => {
      const { store, toprfClient } = createStore();
      const [first, second, third] = await Promise.all(
        [0, 1, 2].map(async () =>
          sealEnvelope(envelopeKeys.wrapKey, 'password', vaultKeySet),
        ),
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
      const [first, second] = await Promise.all(
        [0, 1].map(async () =>
          sealEnvelope(envelopeKeys.wrapKey, 'password', vaultKeySet),
        ),
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
      const envelope = await sealEnvelope(
        envelopeKeys.wrapKey,
        'password',
        vaultKeySet,
      );
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
    it('adds a control record to the control partition', async () => {
      const { store, toprfClient } = createStore();
      const record = createRecord(1);

      await store.writeControlRecord(controlKeys, record);

      expect(toprfClient.addSecretDataItem).toHaveBeenCalledWith({
        encKey: controlKeys.ctrlKey,
        authKeyPair: controlKeys.ctrlAuth,
        secretData: serializeControlRecord(record),
        dataType: EncAccountDataType.EnvelopeControl,
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

      expect(await store.fetchControlRecords(controlKeys)).toStrictEqual([
        createRecord(2),
        createRecord(1),
      ]);
    });

    it('returns no records when the vault has none', async () => {
      const { store } = createStore();

      expect(await store.fetchControlRecords(controlKeys)).toStrictEqual([]);
    });
  });
});
