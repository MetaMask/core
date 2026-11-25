import { keccak256AndHexify } from '@metamask/auth-network-utils';
import type { FetchedSecretDataItem } from '@metamask/toprf-secure-backup';
import { EncAccountDataType } from '@metamask/toprf-secure-backup';
import { bigIntToHex, stringToBytes } from '@metamask/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import {
  createFetchedSecretDataItem,
  createSecretMetadata,
  createSecretMetadataFromMock,
  ImportedPrivateKey1,
  ImportedPrivateKey2,
  ImportedSRP1,
  PrimarySRP2,
  PrivateKey1,
  SRP1,
  SRP2,
} from '../../tests/__fixtures__/secret-metadata.js';
import { PrimarySrpRepairType, SecretType } from '../constants.js';
import { serializeControlRecord } from '../envelope/envelope-keys.js';
import type { ControlRecord } from '../envelope/envelope-keys.js';
import type { PrimarySrpRepairWrites } from '../types.js';
import { InvalidPrimarySecretDataTypeError } from './errors.js';
import {
  findSocialBackupMetadata,
  getCreatedAtMs,
  getDataTypeMigrationUpdates,
  getMetadataSchemaVersion,
  getNewSocialBackupsMetadata,
  getPrimarySrpRepairWrites,
  isSecretDataType,
  parseAndValidateSecretMetadataBackup,
  parseSecretMetadata,
  planPrimarySrpRepair,
  sortNewestFirst,
  splitVaultItems,
} from './secret-data-utils.js';

const { logMock } = vi.hoisted(() => ({ logMock: vi.fn() }));

vi.mock('../logger.js', () => ({
  projectLogger: {},
  createModuleLogger: (): Mock => logMock,
}));

/**
 * @param overrides - The fields to set on the item.
 * @returns A fetched item with a default item id and version.
 */
function createVaultItem(
  overrides: Partial<FetchedSecretDataItem> & { itemId: string },
): FetchedSecretDataItem {
  return {
    data: stringToBytes('secret'),
    version: 'v2',
    ...overrides,
  };
}

/**
 * @param seq - The record sequence number.
 * @returns A well-formed control record.
 */
function createRecord(seq: number): ControlRecord {
  return {
    v: 1,
    seq,
    passwordNamespace: {
      verifier: 'verifier',
      verifierId: 'user',
      authSk: bigIntToHex(11n),
      keyIndex: seq,
    },
    migratedAt: 1,
  };
}

/**
 * @param seq - The record sequence number.
 * @param createdAt - The creation time of the item.
 * @param itemId - The item id.
 * @returns A fetched control record item.
 */
function createControlItem(
  seq: number,
  createdAt: string,
  itemId: string,
): FetchedSecretDataItem {
  return createVaultItem({
    itemId,
    data: serializeControlRecord(createRecord(seq)),
    dataType: EncAccountDataType.EnvelopeControl,
    createdAt,
  });
}

describe('secret data utilities', () => {
  describe('parseSecretMetadata', () => {
    it('sorts primary SRP items ahead of older secrets', () => {
      const results = parseSecretMetadata([
        createFetchedSecretDataItem({
          ...PrivateKey1,
          itemId: 'private-key',
        }),
        createFetchedSecretDataItem({
          ...ImportedSRP1,
          timestamp: 1,
          itemId: 'imported-srp',
        }),
        createFetchedSecretDataItem({
          ...PrimarySRP2,
          timestamp: 300,
          itemId: 'primary-srp',
        }),
      ]);

      expect(results.map((result) => result.itemId)).toStrictEqual([
        'primary-srp',
        'imported-srp',
        'private-key',
      ]);
    });

    it('keeps timestamp order when no primary mnemonic is tagged', () => {
      const results = parseSecretMetadata([
        createFetchedSecretDataItem({
          ...ImportedSRP1,
          itemId: 'imported-srp',
        }),
      ]);

      expect(results.map((result) => result.itemId)).toStrictEqual([
        'imported-srp',
      ]);
    });
  });

  describe('parseAndValidateSecretMetadataBackup', () => {
    it('sorts legacy metadata by timestamp and promotes the first mnemonic', () => {
      const results = parseAndValidateSecretMetadataBackup([
        createFetchedSecretDataItem(PrivateKey1),
        createFetchedSecretDataItem(SRP2),
        createFetchedSecretDataItem(SRP1),
      ]);

      expect(results.map((result) => result.data)).toStrictEqual([
        stringToBytes(SRP1.data),
        stringToBytes(PrivateKey1.data),
        stringToBytes(SRP2.data),
      ]);
    });

    it('keeps an explicitly tagged primary mnemonic first', () => {
      const results = parseAndValidateSecretMetadataBackup([
        createFetchedSecretDataItem(ImportedSRP1),
        createFetchedSecretDataItem(PrimarySRP2),
      ]);

      expect(results[0]?.data).toStrictEqual(stringToBytes(PrimarySRP2.data));
      expect(results[0]?.dataType).toBe(EncAccountDataType.PrimarySrp);
    });

    it('throws when no mnemonic can be used as the primary secret', () => {
      expect(() =>
        parseAndValidateSecretMetadataBackup([
          createFetchedSecretDataItem(ImportedSRP1),
        ]),
      ).toThrow(
        new InvalidPrimarySecretDataTypeError([EncAccountDataType.ImportedSrp]),
      );
    });
  });

  describe('getMetadataSchemaVersion', () => {
    it.each([
      { description: 'there are no items', items: [], expected: 'none' },
      {
        description: 'every item is stored as v1',
        items: [SRP1, PrivateKey1],
        expected: 'v1',
      },
      {
        description: 'every item is stored as v2',
        items: [PrimarySRP2, ImportedPrivateKey1],
        expected: 'v2',
      },
      {
        description: 'the items use both versions',
        items: [SRP1, ImportedPrivateKey1],
        expected: 'mixed',
      },
    ])('returns $expected when $description', ({ items, expected }) => {
      const secretMetadata = parseSecretMetadata(
        items.map(createFetchedSecretDataItem),
      );

      expect(getMetadataSchemaVersion(secretMetadata)).toBe(expected);
    });
  });

  describe('planPrimarySrpRepair', () => {
    const localPrimarySrp = stringToBytes(SRP1.data);

    beforeEach(() => {
      logMock.mockClear();
    });

    it.each([
      {
        description: 'the remote metadata is empty',
        secretDataItems: [],
        metadataSchemaVersion: 'none',
      },
      {
        description: 'the remote metadata only has v2 private keys',
        secretDataItems: [createFetchedSecretDataItem(ImportedPrivateKey1)],
        metadataSchemaVersion: 'v2',
      },
      {
        description: 'the remote metadata only has v2 imported items',
        secretDataItems: [
          createFetchedSecretDataItem(ImportedSRP1),
          createFetchedSecretDataItem(ImportedPrivateKey1),
        ],
        metadataSchemaVersion: 'v2',
      },
      {
        description: 'the remote metadata only has legacy private keys',
        secretDataItems: [createFetchedSecretDataItem(PrivateKey1)],
        metadataSchemaVersion: 'v1',
      },
    ])(
      'plans a missing primary SRP repair with the $metadataSchemaVersion schema when $description',
      async ({ secretDataItems, metadataSchemaVersion }) => {
        const repair = await planPrimarySrpRepair({
          fetchAllSecretDataFn: async () => secretDataItems,
          getPrimaryKeyringSeedPhraseFn: async () => localPrimarySrp,
        });

        expect(repair).toStrictEqual({
          repairType: PrimarySrpRepairType.Missing,
          secretMetadata: expect.any(Array),
          metadataSchemaVersion,
          localPrimarySRP: localPrimarySrp,
        });
        expect(repair?.secretMetadata).toHaveLength(secretDataItems.length);
        expect(logMock).not.toHaveBeenCalled();
      },
    );

    it.each([
      {
        description: 'the remote primary SRP differs from the local one',
        secretDataItems: [createFetchedSecretDataItem(PrimarySRP2)],
        metadataSchemaVersion: 'v2',
      },
      {
        description: 'the earliest legacy SRP is not the local primary SRP',
        secretDataItems: [
          createFetchedSecretDataItem(PrivateKey1),
          createFetchedSecretDataItem(SRP2),
        ],
        metadataSchemaVersion: 'v1',
      },
      {
        description: 'the remote metadata mixes legacy and v2 items',
        secretDataItems: [
          createFetchedSecretDataItem(SRP2),
          createFetchedSecretDataItem(ImportedSRP1),
        ],
        metadataSchemaVersion: 'mixed',
      },
    ])(
      'plans a mismatch with the $metadataSchemaVersion schema when $description',
      async ({ secretDataItems, metadataSchemaVersion }) => {
        const repair = await planPrimarySrpRepair({
          fetchAllSecretDataFn: async () => secretDataItems,
          getPrimaryKeyringSeedPhraseFn: async () => localPrimarySrp,
        });

        expect(repair).toStrictEqual({
          repairType: PrimarySrpRepairType.Mismatch,
          secretMetadata: expect.any(Array),
          metadataSchemaVersion,
          localPrimarySRP: localPrimarySrp,
        });
        expect(repair?.secretMetadata).toHaveLength(secretDataItems.length);
        expect(logMock).not.toHaveBeenCalled();
      },
    );

    it.each([
      {
        description: 'the remote primary SRP matches the local one',
        secretDataItems: [
          createFetchedSecretDataItem({
            ...SRP1,
            dataType: EncAccountDataType.PrimarySrp,
          }),
        ],
      },
      {
        description: 'the earliest legacy SRP is the local primary SRP',
        secretDataItems: [
          createFetchedSecretDataItem(PrivateKey1),
          createFetchedSecretDataItem(SRP2),
          createFetchedSecretDataItem(SRP1),
        ],
      },
    ])('plans nothing when $description', async ({ secretDataItems }) => {
      const repair = await planPrimarySrpRepair({
        fetchAllSecretDataFn: async () => secretDataItems,
        getPrimaryKeyringSeedPhraseFn: async () => localPrimarySrp,
      });

      expect(repair).toBeUndefined();
      expect(logMock).not.toHaveBeenCalled();
    });

    it('logs fetch failures and plans nothing', async () => {
      const error = new Error('network failure');

      const repair = await planPrimarySrpRepair({
        fetchAllSecretDataFn: async () => {
          throw error;
        },
        getPrimaryKeyringSeedPhraseFn: async () => localPrimarySrp,
      });

      expect(repair).toBeUndefined();
      expect(logMock).toHaveBeenCalledWith(
        'Error planning primary SRP repair',
        error,
      );
    });

    it('logs parsing failures and plans nothing', async () => {
      const repair = await planPrimarySrpRepair({
        fetchAllSecretDataFn: async () => [
          {
            data: stringToBytes('not valid metadata'),
            itemId: 'invalid',
            version: 'v2',
          },
        ],
        getPrimaryKeyringSeedPhraseFn: async () => localPrimarySrp,
      });

      expect(repair).toBeUndefined();
      expect(logMock).toHaveBeenCalledWith(
        'Error planning primary SRP repair',
        expect.any(Error),
      );
    });

    it.each([
      { description: 'missing', secretDataItems: [] },
      {
        description: 'present',
        secretDataItems: [createFetchedSecretDataItem(SRP1)],
      },
    ])(
      'logs keyring failures and plans nothing when the primary SRP is $description',
      async ({ secretDataItems }) => {
        const error = new Error('export failed');

        const repair = await planPrimarySrpRepair({
          fetchAllSecretDataFn: async () => secretDataItems,
          getPrimaryKeyringSeedPhraseFn: async () => {
            throw error;
          },
        });

        expect(repair).toBeUndefined();
        expect(logMock).toHaveBeenCalledWith(
          'Error planning primary SRP repair',
          error,
        );
      },
    );
  });

  describe('getPrimarySrpRepairWrites', () => {
    const localPrimarySrp = stringToBytes(SRP1.data);
    const ThirdSRP = {
      data: 'third srp',
      timestamp: 150,
      itemId: 'srp-3',
    };

    /**
     * Plan a repair for the remote items and decide its writes.
     *
     * @param secretDataItems - The remote items.
     * @returns The repair type and the writes of the plan.
     */
    async function planWrites(
      secretDataItems: FetchedSecretDataItem[],
    ): Promise<{
      repairType?: PrimarySrpRepairType;
      writes?: PrimarySrpRepairWrites;
    }> {
      const plan = await planPrimarySrpRepair({
        fetchAllSecretDataFn: async () => secretDataItems,
        getPrimaryKeyringSeedPhraseFn: async () => localPrimarySrp,
      });
      return plan
        ? {
            repairType: plan.repairType,
            writes: getPrimarySrpRepairWrites(plan),
          }
        : {};
    }

    describe('when the primary SRP is missing', () => {
      it.each([
        {
          description: 'the remote metadata is empty',
          secretDataItems: [],
        },
        {
          description: 'the remote metadata only has v2 private keys',
          secretDataItems: [createFetchedSecretDataItem(ImportedPrivateKey1)],
        },
      ])(
        'adds the local primary SRP without retagging when $description',
        async ({ secretDataItems }) => {
          expect(await planWrites(secretDataItems)).toStrictEqual({
            repairType: PrimarySrpRepairType.Missing,
            writes: { retag: [], primary: { type: 'add' } },
          });
        },
      );

      it('migrates the legacy private keys and adds the local primary SRP when the remote metadata is v1', async () => {
        expect(
          await planWrites([createFetchedSecretDataItem(PrivateKey1)]),
        ).toStrictEqual({
          repairType: PrimarySrpRepairType.Missing,
          writes: {
            retag: [
              {
                itemId: PrivateKey1.itemId,
                dataType: EncAccountDataType.ImportedPrivateKey,
              },
            ],
            primary: { type: 'add' },
          },
        });
      });

      it('promotes the remote imported copy of the local primary SRP instead of adding a duplicate', async () => {
        expect(
          await planWrites([createFetchedSecretDataItem(ImportedSRP1)]),
        ).toStrictEqual({
          repairType: PrimarySrpRepairType.Missing,
          writes: {
            retag: [],
            primary: { type: 'promote', itemId: SRP1.itemId },
          },
        });
      });

      it('adds the local primary SRP when its imported copy has no item id', () => {
        const writes = getPrimarySrpRepairWrites({
          repairType: PrimarySrpRepairType.Missing,
          secretMetadata: [
            createSecretMetadata(SRP1.data, {
              dataType: EncAccountDataType.ImportedSrp,
            }),
          ],
          metadataSchemaVersion: 'v2',
          localPrimarySRP: localPrimarySrp,
        });

        expect(writes).toStrictEqual({
          retag: [],
          primary: { type: 'add' },
        });
      });
    });

    describe('when the primary SRP mismatches', () => {
      const demoteSrp2 = {
        itemId: SRP2.itemId,
        dataType: EncAccountDataType.ImportedSrp,
      };

      it.each([
        {
          description: 'the remote metadata is v2',
          secretDataItems: [createFetchedSecretDataItem(PrimarySRP2)],
        },
        {
          description: 'the remote metadata is v1',
          secretDataItems: [createFetchedSecretDataItem(SRP2)],
        },
      ])(
        'demotes the remote primary SRP and adds the local one when $description',
        async ({ secretDataItems }) => {
          expect(await planWrites(secretDataItems)).toStrictEqual({
            repairType: PrimarySrpRepairType.Mismatch,
            writes: { retag: [demoteSrp2], primary: { type: 'add' } },
          });
        },
      );

      it.each([
        {
          description: 'an imported SRP',
          secretDataItems: [
            createFetchedSecretDataItem(PrimarySRP2),
            createFetchedSecretDataItem(ImportedSRP1),
          ],
        },
        {
          description: 'a legacy mnemonic',
          secretDataItems: [
            createFetchedSecretDataItem(PrimarySRP2),
            createFetchedSecretDataItem(SRP1),
          ],
        },
      ])(
        'demotes the remote primary SRP and promotes the remote copy of the local one when the copy is $description',
        async ({ secretDataItems }) => {
          expect(await planWrites(secretDataItems)).toStrictEqual({
            repairType: PrimarySrpRepairType.Mismatch,
            writes: {
              retag: [demoteSrp2],
              primary: { type: 'promote', itemId: SRP1.itemId },
            },
          });
        },
      );

      it('retags every legacy secret and leaves the imported ones alone', async () => {
        expect(
          await planWrites([
            createFetchedSecretDataItem(ImportedPrivateKey2),
            createFetchedSecretDataItem(ThirdSRP),
            createFetchedSecretDataItem(PrivateKey1),
            createFetchedSecretDataItem(PrimarySRP2),
          ]),
        ).toStrictEqual({
          repairType: PrimarySrpRepairType.Mismatch,
          writes: {
            retag: [
              demoteSrp2,
              {
                itemId: PrivateKey1.itemId,
                dataType: EncAccountDataType.ImportedPrivateKey,
              },
              {
                itemId: ThirdSRP.itemId,
                dataType: EncAccountDataType.ImportedSrp,
              },
            ],
            primary: { type: 'add' },
          },
        });
      });

      it('does not retag a secret without an item id', () => {
        const writes = getPrimarySrpRepairWrites({
          repairType: PrimarySrpRepairType.Mismatch,
          secretMetadata: [createSecretMetadata(SRP2.data)],
          metadataSchemaVersion: 'v1',
          localPrimarySRP: localPrimarySrp,
        });

        expect(writes).toStrictEqual({ retag: [], primary: { type: 'add' } });
      });
    });
  });

  describe('getDataTypeMigrationUpdates', () => {
    it('classifies legacy items in their existing order', () => {
      const updates = getDataTypeMigrationUpdates([
        createSecretMetadataFromMock(SRP1),
        createSecretMetadataFromMock(SRP2),
        createSecretMetadataFromMock(PrivateKey1),
      ]);

      expect(updates).toStrictEqual([
        { itemId: SRP1.itemId, dataType: EncAccountDataType.PrimarySrp },
        { itemId: SRP2.itemId, dataType: EncAccountDataType.ImportedSrp },
        {
          itemId: PrivateKey1.itemId,
          dataType: EncAccountDataType.ImportedPrivateKey,
        },
      ]);
    });

    it('preserves an existing primary and skips items outside the migration', () => {
      const updates = getDataTypeMigrationUpdates([
        createSecretMetadata(SRP1.data, {
          dataType: EncAccountDataType.PrimarySrp,
          itemId: 'primary-srp',
          storageVersion: 'v1',
        }),
        createSecretMetadata('already migrated srp', {
          dataType: EncAccountDataType.ImportedSrp,
          itemId: 'migrated-srp',
          storageVersion: 'v2',
        }),
        createSecretMetadata('password backup', {
          dataType: EncAccountDataType.PrimarySrp,
          itemId: 'PW_BACKUP',
          storageVersion: 'v1',
        }),
        createSecretMetadata('missing item id'),
      ]);

      expect(updates).toStrictEqual([
        { itemId: 'primary-srp', dataType: EncAccountDataType.PrimarySrp },
      ]);
    });
  });

  describe('getNewSocialBackupsMetadata', () => {
    it('returns only backups that are not already present by hash and type', () => {
      const existingData = stringToBytes('existing');
      const newData = stringToBytes('new');
      const currentBackups = [
        {
          hash: keccak256AndHexify(existingData),
          type: SecretType.Mnemonic,
          keyringId: 'existing-keyring',
        },
      ];

      const result = getNewSocialBackupsMetadata(currentBackups, [
        {
          data: existingData,
          type: SecretType.Mnemonic,
          keyringId: 'duplicate-keyring',
        },
        {
          data: newData,
          type: SecretType.Mnemonic,
          keyringId: 'new-keyring',
        },
      ]);

      expect(result).toStrictEqual([
        {
          hash: keccak256AndHexify(newData),
          type: SecretType.Mnemonic,
          keyringId: 'new-keyring',
        },
      ]);
    });
  });

  describe('isSecretDataType', () => {
    it.each([
      ['PrimarySrp', EncAccountDataType.PrimarySrp, true],
      ['ImportedSrp', EncAccountDataType.ImportedSrp, true],
      ['ImportedPrivateKey', EncAccountDataType.ImportedPrivateKey, true],
      ['KeyEnvelope', EncAccountDataType.KeyEnvelope, false],
      ['EnvelopeControl', EncAccountDataType.EnvelopeControl, false],
      ['an unknown value', 99 as EncAccountDataType, false],
      ['undefined (legacy item)', undefined, true],
    ])('returns the expected result for %s', (_name, dataType, expected) => {
      expect(isSecretDataType(dataType)).toBe(expected);
    });
  });

  describe('getCreatedAtMs', () => {
    it('returns 0 when the creation time is unknown', () => {
      expect(getCreatedAtMs(createVaultItem({ itemId: 'a' }))).toBe(0);
    });

    it('parses a numeric string as milliseconds', () => {
      expect(
        getCreatedAtMs(
          createVaultItem({ itemId: 'a', createdAt: '1700000000000' }),
        ),
      ).toBe(1700000000000);
    });

    it('parses an ISO date string', () => {
      expect(
        getCreatedAtMs(
          createVaultItem({
            itemId: 'a',
            createdAt: '2026-01-01T00:00:00.000Z',
          }),
        ),
      ).toBe(Date.parse('2026-01-01T00:00:00.000Z'));
    });

    it('parses a Cassandra TIMEUUID (UUIDv1) string as milliseconds', () => {
      expect(
        getCreatedAtMs(
          createVaultItem({
            itemId: 'a',
            createdAt: 'c14cc4a0-d1cd-11f0-9878-3be4d8d3a8a0',
          }),
        ),
      ).toBe(Date.parse('2025-12-05T11:30:09.002Z'));
    });

    it('returns 0 for a non-v1 UUID', () => {
      expect(
        getCreatedAtMs(
          createVaultItem({
            itemId: 'a',
            createdAt: '550e8400-e29b-41d4-a716-446655440000',
          }),
        ),
      ).toBe(0);
    });

    it('returns 0 for an empty or whitespace-only creation time', () => {
      expect(
        getCreatedAtMs(createVaultItem({ itemId: 'a', createdAt: '   ' })),
      ).toBe(0);
    });

    it('returns 0 for an unparseable creation time', () => {
      expect(
        getCreatedAtMs(createVaultItem({ itemId: 'a', createdAt: 'garbage' })),
      ).toBe(0);
    });
  });

  describe('sortNewestFirst', () => {
    it('sorts by creation time descending and breaks ties by later index first', () => {
      const items = [
        createVaultItem({ itemId: 'old', createdAt: '1000' }),
        createVaultItem({ itemId: 'tie-first', createdAt: '3000' }),
        createVaultItem({ itemId: 'tie-second', createdAt: '3000' }),
        createVaultItem({ itemId: 'unknown' }),
      ];
      const original = [...items];

      const sorted = sortNewestFirst(items);

      expect(sorted.map((item) => item.itemId)).toStrictEqual([
        'tie-second',
        'tie-first',
        'old',
        'unknown',
      ]);
      expect(sorted).not.toBe(items);
      expect(items).toStrictEqual(original);
    });

    it('sorts Cassandra TIMEUUIDs by 60-bit timestamp descending rather than input or lexicographical order', () => {
      // Chronological order: t1 < t1Plus100ns < t2 < t3 (note t1 > t2 lexicographically).
      const t1 = 'c14cc4a0-d1cd-11f0-9878-3be4d8d3a8a0';
      const t1Plus100ns = 'c14cc4a1-d1cd-11f0-9878-3be4d8d3a8a0';
      const t2 = '04e72250-d1ce-11f0-9878-3be4d8d3a8a0';
      const t3 = 'B2649610-D1CE-11F0-9878-3BE4D8D3A8A0';

      const sorted = sortNewestFirst([
        createVaultItem({ itemId: 't2', createdAt: t2 }),
        createVaultItem({ itemId: 'unknown' }),
        createVaultItem({ itemId: 't3', createdAt: t3 }),
        createVaultItem({ itemId: 't1', createdAt: t1 }),
        createVaultItem({ itemId: 't1-plus-100ns', createdAt: t1Plus100ns }),
      ]);

      expect(sorted.map((item) => item.itemId)).toStrictEqual([
        't3',
        't2',
        't1-plus-100ns',
        't1',
        'unknown',
      ]);
    });

    it('sorts synthetic pre-1970 TIMEUUIDs ahead of unknown creation times', () => {
      const sorted = sortNewestFirst([
        createVaultItem({
          itemId: 'older',
          createdAt: '00000001-0000-1000-8000-000000000001',
        }),
        createVaultItem({ itemId: 'unknown' }),
        createVaultItem({
          itemId: 'newer',
          createdAt: '00000002-0000-1000-8000-000000000002',
        }),
      ]);

      expect(sorted.map((item) => item.itemId)).toStrictEqual([
        'newer',
        'older',
        'unknown',
      ]);
    });
  });

  describe('splitVaultItems', () => {
    it('splits secret items from control records and drops key envelopes', () => {
      const { secretItems, controlRecords } = splitVaultItems([
        createVaultItem({
          itemId: 'primary',
          data: stringToBytes('primary secret'),
          dataType: EncAccountDataType.PrimarySrp,
          createdAt: '1',
        }),
        createVaultItem({
          itemId: 'envelope',
          data: stringToBytes('{}'),
          dataType: EncAccountDataType.KeyEnvelope,
          createdAt: '2',
        }),
        createControlItem(1, '100', 'control-old'),
        createVaultItem({
          itemId: 'malformed',
          data: stringToBytes('{"v":1}'),
          dataType: EncAccountDataType.EnvelopeControl,
          createdAt: '300',
        }),
        createControlItem(2, '200', 'control-new'),
        createVaultItem({
          itemId: 'legacy',
          data: stringToBytes('legacy secret'),
          createdAt: '4',
        }),
      ]);

      expect(secretItems.map((item) => item.itemId)).toStrictEqual([
        'primary',
        'legacy',
      ]);
      expect(controlRecords.map((record) => record.seq)).toStrictEqual([2, 1]);
    });

    it('skips a control record whose auth key is not a valid private key', () => {
      const record = createRecord(3);
      record.passwordNamespace.authSk = 'zz';

      const { controlRecords } = splitVaultItems([
        createControlItem(1, '100', 'control-valid'),
        createVaultItem({
          itemId: 'control-bad-auth-key',
          data: serializeControlRecord(record),
          dataType: EncAccountDataType.EnvelopeControl,
          createdAt: '300',
        }),
      ]);

      expect(controlRecords.map(({ seq }) => seq)).toStrictEqual([1]);
    });

    it('returns empty lists for empty input', () => {
      expect(splitVaultItems([])).toStrictEqual({
        secretItems: [],
        controlRecords: [],
      });
    });
  });

  describe('control items in secret data processing', () => {
    it('parseSecretMetadata ignores control items', () => {
      const results = parseSecretMetadata([
        createFetchedSecretDataItem({
          ...ImportedSRP1,
          itemId: 'imported-srp',
        }),
        createControlItem(1, '100', 'control'),
        createVaultItem({
          itemId: 'envelope',
          data: stringToBytes('{}'),
          dataType: EncAccountDataType.KeyEnvelope,
        }),
      ]);

      expect(results.map((result) => result.itemId)).toStrictEqual([
        'imported-srp',
      ]);
    });
  });

  describe('findSocialBackupMetadata', () => {
    it('finds a backup by its data hash and type', () => {
      const data = stringToBytes('seed phrase');
      const backup = {
        hash: keccak256AndHexify(data),
        type: SecretType.Mnemonic,
        keyringId: 'keyring-id',
      };

      expect(
        findSocialBackupMetadata([backup], data, SecretType.Mnemonic),
      ).toBe(backup);
    });

    it('finds a backup by its data hash and `Mnemonic` type without specifying the type', () => {
      const data = stringToBytes('seed phrase');
      const backup = {
        hash: keccak256AndHexify(data),
        type: SecretType.Mnemonic,
        keyringId: 'keyring-id',
      };

      expect(findSocialBackupMetadata([backup], data)).toBe(backup);
    });

    it('finds a private key backup when the type is specified', () => {
      const data = stringToBytes('private key');
      const backup = {
        hash: keccak256AndHexify(data),
        type: SecretType.PrivateKey,
      };

      expect(
        findSocialBackupMetadata([backup], data, SecretType.PrivateKey),
      ).toBe(backup);
    });

    it('returns undefined when the type does not match', () => {
      const data = stringToBytes('same bytes');
      const backup = {
        hash: keccak256AndHexify(data),
        type: SecretType.Mnemonic,
      };

      expect(
        findSocialBackupMetadata([backup], data, SecretType.PrivateKey),
      ).toBeUndefined();
    });
  });
});
