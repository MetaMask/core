import { keccak256AndHexify } from '@metamask/auth-network-utils';
import type { FetchedSecretDataItem } from '@metamask/toprf-secure-backup';
import { EncAccountDataType } from '@metamask/toprf-secure-backup';

import { SecretType } from '../constants.js';
import { InvalidPrimarySecretDataTypeError } from '../errors.js';
import { SecretMetadata } from '../SecretMetadata.js';
import type { SocialBackupsMetadata } from '../types.js';

export type SecretDataTypeMigrationUpdate = {
  itemId: string;
  dataType: EncAccountDataType;
};

export type SecretBackupData = Omit<SocialBackupsMetadata, 'hash'> & {
  data: Uint8Array;
};

/**
 * Parse, sort, and validate secret metadata fetched from the metadata store.
 *
 * @param secretDataItems - The encrypted metadata items fetched from storage.
 * @returns The parsed and ordered secret metadata.
 * @throws If no mnemonic can be used as the primary secret.
 */
export function parseAndSortSecretMetadata(
  secretDataItems: FetchedSecretDataItem[],
): SecretMetadata[] {
  const results: SecretMetadata[] = secretDataItems.map((item) =>
    SecretMetadata.fromRawMetadata(item.data, {
      itemId: item.itemId,
      dataType: item.dataType,
      createdAt: item.createdAt,
      storageVersion: item.version,
    }),
  );

  // Sort: PrimarySrp first, then by client timestamp (oldest first).
  results.sort((a, b) => SecretMetadata.compare(a, b, 'asc'));

  const primaryIndex = results.findIndex(
    (result) =>
      SecretMetadata.matchesType(result, SecretType.Mnemonic) &&
      (result.dataType === undefined ||
        result.dataType === null ||
        result.dataType === EncAccountDataType.PrimarySrp),
  );
  if (primaryIndex === -1) {
    throw InvalidPrimarySecretDataTypeError.fromSecretMetadata(results);
  }

  if (primaryIndex !== 0) {
    const [primary] = results.splice(primaryIndex, 1);
    results.unshift(primary);
  }

  return results;
}

/**
 * Determine the data-type updates required to migrate legacy secret metadata.
 *
 * The input is expected to already be ordered according to the legacy
 * primary-secret selection rules.
 *
 * @param secretDatas - The ordered secret metadata to migrate.
 * @returns The storage updates required for the migration.
 */
export function getDataTypeMigrationUpdates(
  secretDatas: SecretMetadata[],
): SecretDataTypeMigrationUpdate[] {
  let hasPrimarySrp = secretDatas.some(
    (secret) =>
      secret.itemId &&
      secret.itemId !== 'PW_BACKUP' &&
      secret.dataType === EncAccountDataType.PrimarySrp,
  );

  const updates: SecretDataTypeMigrationUpdate[] = [];

  for (const secret of secretDatas) {
    if (!secret.itemId || secret.itemId === 'PW_BACKUP') {
      continue;
    }

    // Skip items that are already migrated (v2 with dataType set).
    const isAlreadyMigrated =
      secret.storageVersion === 'v2' &&
      secret.dataType !== undefined &&
      secret.dataType !== null;
    if (isAlreadyMigrated) {
      continue;
    }

    let dataType: EncAccountDataType;

    if (SecretMetadata.matchesType(secret, SecretType.Mnemonic)) {
      // Preserve existing PrimarySrp designation.
      if (secret.dataType === EncAccountDataType.PrimarySrp) {
        dataType = EncAccountDataType.PrimarySrp;
      } else if (hasPrimarySrp) {
        dataType = EncAccountDataType.ImportedSrp;
      } else {
        dataType = EncAccountDataType.PrimarySrp;
        hasPrimarySrp = true;
      }
    } else if (SecretMetadata.matchesType(secret, SecretType.PrivateKey)) {
      dataType = EncAccountDataType.ImportedPrivateKey;
    } else {
      continue;
    }

    updates.push({ itemId: secret.itemId, dataType });
  }

  return updates;
}

/**
 * Find new local backup metadata entries without mutating the current state.
 *
 * @param currentBackupsMetadata - Existing backup metadata in controller state.
 * @param secretData - New secret data to index.
 * @returns The backup metadata entries that should be appended.
 */
export function getNewSocialBackupsMetadata(
  currentBackupsMetadata: SocialBackupsMetadata[],
  secretData: SecretBackupData | SecretBackupData[],
): SocialBackupsMetadata[] {
  const newBackupsMetadata = Array.isArray(secretData)
    ? secretData
    : [secretData];
  const filteredNewBackupsMetadata: SocialBackupsMetadata[] = [];

  // Keep the existing duplicate semantics: compare each item against the
  // state that existed before this operation began.
  newBackupsMetadata.forEach((item) => {
    const { keyringId, data, type } = item;
    const backupHash = keccak256AndHexify(data);

    const backupStateAlreadyExisted = currentBackupsMetadata.some(
      (backup) => backup.hash === backupHash && backup.type === type,
    );

    if (!backupStateAlreadyExisted) {
      filteredNewBackupsMetadata.push({
        keyringId,
        hash: backupHash,
        type,
      });
    }
  });

  return filteredNewBackupsMetadata;
}
