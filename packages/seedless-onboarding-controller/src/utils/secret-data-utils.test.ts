import { keccak256AndHexify } from '@metamask/auth-network-utils';
import type { FetchedSecretDataItem } from '@metamask/toprf-secure-backup';
import { EncAccountDataType } from '@metamask/toprf-secure-backup';
import { bigIntToHex, stringToBytes } from '@metamask/utils';
import { describe, expect, it } from 'vitest';

import {
  createFetchedSecretDataItem,
  createSecretMetadata,
  createSecretMetadataFromMock,
  ImportedSRP1,
  PrimarySRP2,
  PrivateKey1,
  SRP1,
  SRP2,
} from '../../tests/__fixtures__/secret-metadata.js';
import { SecretType } from '../constants.js';
import { serializeControlRecord } from '../envelope/envelope-keys.js';
import type { ControlRecord } from '../envelope/envelope-keys.js';
import { InvalidPrimarySecretDataTypeError } from '../errors.js';
import {
  getCreatedAtMs,
  getDataTypeMigrationUpdates,
  getNewSocialBackupsMetadata,
  isSecretDataType,
  parseAndValidateSecretMetadataBackup,
  parseSecretMetadata,
  sortNewestFirst,
  splitVaultItems,
} from './secret-data-utils.js';

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
});
