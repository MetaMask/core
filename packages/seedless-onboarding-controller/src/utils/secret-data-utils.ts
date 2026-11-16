import { keccak256AndHexify } from '@metamask/auth-network-utils';
import type { FetchedSecretDataItem } from '@metamask/toprf-secure-backup';
import { EncAccountDataType } from '@metamask/toprf-secure-backup';

import { controllerName, SecretType } from '../constants.js';
import { parseControlRecord } from '../envelope/envelope-keys.js';
import type { ControlRecord } from '../envelope/envelope-keys.js';
import { InvalidPrimarySecretDataTypeError } from '../errors.js';
import { createModuleLogger, projectLogger } from '../logger.js';
import { SecretMetadata } from '../SecretMetadata.js';
import type { SocialBackupsMetadata } from '../types.js';

const log = createModuleLogger(projectLogger, controllerName);

export type SecretDataTypeMigrationUpdate = {
  itemId: string;
  dataType: EncAccountDataType;
};

export type SecretBackupData = Omit<SocialBackupsMetadata, 'hash'> & {
  data: Uint8Array;
};

/**
 * Check whether an item of a data type is secret data, i.e. stored in the
 * vault partition as a secret. Legacy items without a data type are secrets.
 *
 * @param dataType - The data type of the item.
 * @returns `true` for secret data types and legacy items, `false` otherwise.
 */
export function isSecretDataType(
  dataType: EncAccountDataType | undefined,
): boolean {
  if (dataType === undefined) {
    return true;
  }
  return (
    dataType === EncAccountDataType.PrimarySrp ||
    dataType === EncAccountDataType.ImportedSrp ||
    dataType === EncAccountDataType.ImportedPrivateKey
  );
}

/**
 * @param item - A fetched item.
 * @returns The item's creation time in milliseconds, or 0 when unknown.
 */
export function getCreatedAtMs(item: FetchedSecretDataItem): number {
  if (item.createdAt === undefined) {
    return 0;
  }
  const asNumber = Number(item.createdAt);
  const ms = Number.isNaN(asNumber) ? Date.parse(item.createdAt) : asNumber;
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * Sort fetched items newest first. Items with equal creation times keep the
 * reverse of their original order, so the later item comes first.
 *
 * @param items - The fetched items.
 * @returns A new array of the items, newest first.
 */
export function sortNewestFirst(
  items: FetchedSecretDataItem[],
): FetchedSecretDataItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        getCreatedAtMs(b.item) - getCreatedAtMs(a.item) || b.index - a.index,
    )
    .map(({ item }) => item);
}

/**
 * Split the items of the vault partition into secret items and control
 * records. Secret items keep their original order. Control records are
 * parsed newest first; malformed records are logged and skipped. Key envelope
 * items belong to neither list.
 *
 * @param items - The fetched items of the vault partition.
 * @returns The secret items and the parsed control records.
 */
export function splitVaultItems(items: FetchedSecretDataItem[]): {
  secretItems: FetchedSecretDataItem[];
  controlRecords: ControlRecord[];
} {
  const secretItems = items.filter((item) => isSecretDataType(item.dataType));

  const controlItems = sortNewestFirst(
    items.filter(
      (item) => item.dataType === EncAccountDataType.EnvelopeControl,
    ),
  );
  const controlRecords: ControlRecord[] = [];
  for (const item of controlItems) {
    try {
      controlRecords.push(parseControlRecord(item.data));
    } catch (error) {
      log('Ignoring malformed control record', error);
    }
  }

  return { secretItems, controlRecords };
}

/**
 * Parse and sort secret metadata fetched from the metadata store.
 *
 * Primary SRP items are ordered first, then remaining items by client
 * timestamp (oldest first). This does not require a primary mnemonic.
 * Items that are not secret data (e.g. control records) are ignored.
 *
 * @param secretDataItems - The encrypted metadata items fetched from storage.
 * @returns The parsed secret metadata in sort order.
 */
export function parseSecretMetadata(
  secretDataItems: FetchedSecretDataItem[],
): SecretMetadata[] {
  const results: SecretMetadata[] = secretDataItems
    .filter((item) => isSecretDataType(item.dataType))
    .map((item) =>
      SecretMetadata.fromRawMetadata(item.data, {
        itemId: item.itemId,
        dataType: item.dataType,
        createdAt: item.createdAt,
        storageVersion: item.version,
      }),
    );

  // Sort: PrimarySrp first, then by client timestamp (oldest first).
  results.sort((a, b) => SecretMetadata.compare(a, b, 'asc'));

  return results;
}

/**
 * A mnemonic can be the primary secret when it is untagged or explicitly
 * tagged as the primary SRP.
 *
 * @param secret - The secret metadata to check.
 * @returns Whether the secret can be selected as the primary mnemonic.
 */
export function isPrimarySecretCandidate(secret: SecretMetadata): boolean {
  return (
    SecretMetadata.matchesType(secret, SecretType.Mnemonic) &&
    (secret.dataType === undefined ||
      secret.dataType === null ||
      secret.dataType === EncAccountDataType.PrimarySrp)
  );
}

/**
 * Validate that parsed secret metadata contains a primary mnemonic, and move
 * that mnemonic to the front.
 *
 * @param secretMetadata - Parsed secret metadata.
 * @returns The same array with the primary mnemonic at index 0.
 * @throws If no mnemonic can be used as the primary secret.
 */
export function validateSecretMetadataBackup(
  secretMetadata: SecretMetadata[],
): SecretMetadata[] {
  const primaryIndex = secretMetadata.findIndex(isPrimarySecretCandidate);
  if (primaryIndex === -1) {
    throw InvalidPrimarySecretDataTypeError.fromSecretMetadata(secretMetadata);
  }

  if (primaryIndex !== 0) {
    const [primary] = secretMetadata.splice(primaryIndex, 1);
    secretMetadata.unshift(primary);
  }

  return secretMetadata;
}

/**
 * Parse, sort, and validate a secret metadata backup.
 *
 * @param secretDataItems - The encrypted metadata items fetched from storage.
 * @returns The parsed and ordered secret metadata.
 * @throws If no mnemonic can be used as the primary secret.
 */
export function parseAndValidateSecretMetadataBackup(
  secretDataItems: FetchedSecretDataItem[],
): SecretMetadata[] {
  return validateSecretMetadataBackup(parseSecretMetadata(secretDataItems));
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
