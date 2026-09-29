import { keccak256AndHexify } from '@metamask/auth-network-utils';
import type { FetchedSecretDataItem } from '@metamask/toprf-secure-backup';
import { EncAccountDataType } from '@metamask/toprf-secure-backup';
import { stringToBytes } from '@metamask/utils';

import {
  SeedlessOnboardingControllerErrorMessage,
  SecretType,
} from '../constants.js';
import { InvalidPrimarySecretDataTypeError } from '../errors.js';
import { SecretMetadata } from '../SecretMetadata.js';
import {
  getDataTypeMigrationUpdates,
  getNewSocialBackupsMetadata,
  parseAndSortSecretMetadata,
} from './secret-data-utils.js';

function createSecretMetadata(
  data: string,
  options: {
    dataType?: EncAccountDataType;
    itemId?: string;
    storageVersion?: 'v1' | 'v2';
    timestamp?: number;
    type?: SecretType;
  } = {},
): SecretMetadata {
  return new SecretMetadata(stringToBytes(data), options);
}

function createFetchedSecretDataItem({
  data,
  timestamp,
  itemId,
  type = SecretType.Mnemonic,
  dataType,
  version,
  createdAt,
}: {
  data: string;
  timestamp: number;
  itemId?: string;
  type?: SecretType;
  dataType?: EncAccountDataType;
  version?: 'v1' | 'v2';
  createdAt?: string;
}): FetchedSecretDataItem {
  const metadata = new SecretMetadata(stringToBytes(data), {
    timestamp,
    type,
    ...(dataType === undefined ? {} : { dataType }),
  });

  return {
    data: metadata.toBytes(),
    itemId,
    version: version ?? (dataType === undefined ? 'v1' : 'v2'),
    dataType,
    createdAt,
  } as FetchedSecretDataItem;
}

describe('secret data utilities', () => {
  describe('parseAndSortSecretMetadata', () => {
    it('sorts legacy metadata by timestamp and promotes the first mnemonic', () => {
      const results = parseAndSortSecretMetadata([
        createFetchedSecretDataItem({
          data: 'private key',
          timestamp: 50,
          itemId: 'private-key',
          type: SecretType.PrivateKey,
        }),
        createFetchedSecretDataItem({
          data: 'second srp',
          timestamp: 200,
          itemId: 'srp-2',
        }),
        createFetchedSecretDataItem({
          data: 'first srp',
          timestamp: 100,
          itemId: 'srp-1',
        }),
      ]);

      expect(results.map((result) => result.data)).toStrictEqual([
        stringToBytes('first srp'),
        stringToBytes('private key'),
        stringToBytes('second srp'),
      ]);
    });

    it('keeps an explicitly tagged primary mnemonic first', () => {
      const results = parseAndSortSecretMetadata([
        createFetchedSecretDataItem({
          data: 'imported srp',
          timestamp: 1,
          itemId: 'imported-srp',
          dataType: EncAccountDataType.ImportedSrp,
        }),
        createFetchedSecretDataItem({
          data: 'primary srp',
          timestamp: 2,
          itemId: 'primary-srp',
          dataType: EncAccountDataType.PrimarySrp,
        }),
      ]);

      expect(results[0]?.data).toStrictEqual(stringToBytes('primary srp'));
      expect(results[0]?.dataType).toBe(EncAccountDataType.PrimarySrp);
    });

    it('throws when no mnemonic can be used as the primary secret', () => {
      expect(() =>
        parseAndSortSecretMetadata([
          createFetchedSecretDataItem({
            data: 'imported srp',
            timestamp: 1,
            itemId: 'imported-srp',
            dataType: EncAccountDataType.ImportedSrp,
          }),
        ]),
      ).toThrow(
        new InvalidPrimarySecretDataTypeError([EncAccountDataType.ImportedSrp]),
      );
    });
  });

  describe('getDataTypeMigrationUpdates', () => {
    it('classifies legacy items in their existing order', () => {
      const updates = getDataTypeMigrationUpdates([
        createSecretMetadata('first srp', {
          itemId: 'srp-1',
          timestamp: 100,
        }),
        createSecretMetadata('second srp', {
          itemId: 'srp-2',
          timestamp: 200,
        }),
        createSecretMetadata('private key', {
          itemId: 'private-key',
          timestamp: 300,
          type: SecretType.PrivateKey,
        }),
      ]);

      expect(updates).toStrictEqual([
        { itemId: 'srp-1', dataType: EncAccountDataType.PrimarySrp },
        { itemId: 'srp-2', dataType: EncAccountDataType.ImportedSrp },
        {
          itemId: 'private-key',
          dataType: EncAccountDataType.ImportedPrivateKey,
        },
      ]);
    });

    it('preserves an existing primary and skips items outside the migration', () => {
      const updates = getDataTypeMigrationUpdates([
        createSecretMetadata('primary srp', {
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
});
