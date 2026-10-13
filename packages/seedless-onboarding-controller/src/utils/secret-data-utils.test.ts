import { keccak256AndHexify } from '@metamask/auth-network-utils';
import { EncAccountDataType } from '@metamask/toprf-secure-backup';
import { stringToBytes } from '@metamask/utils';

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
import { InvalidPrimarySecretDataTypeError } from '../errors.js';
import {
  getDataTypeMigrationUpdates,
  getNewSocialBackupsMetadata,
  parseAndValidateSecretMetadataBackup,
  parseSecretMetadata,
} from './secret-data-utils.js';

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
});
