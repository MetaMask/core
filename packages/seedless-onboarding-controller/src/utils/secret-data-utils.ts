import { keccak256AndHexify } from '@metamask/auth-network-utils';
import type { FetchedSecretDataItem } from '@metamask/toprf-secure-backup';
import { EncAccountDataType } from '@metamask/toprf-secure-backup';

import { controllerName, SecretType } from '../constants.js';
import { parseControlRecord } from '../envelope/envelope-keys.js';
import type { ControlRecord } from '../envelope/envelope-keys.js';
import { createModuleLogger, projectLogger } from '../logger.js';
import { SecretMetadata } from '../SecretMetadata.js';
import type { SocialBackupsMetadata } from '../types.js';
import { InvalidPrimarySecretDataTypeError } from './errors.js';

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

// 100-nanosecond intervals between the UUIDv1 Gregorian epoch (1582-10-15)
// and the Unix epoch (1970-01-01): 141,427 days * 86,400 s * 10,000,000 ticks/s.
const GREGORIAN_TO_UNIX_EPOCH_TICKS = 122_192_928_000_000_000n;
const TICKS_PER_MS = 10_000n;

// RFC 4122 version 1 UUID (Cassandra TIMEUUID): xxxxxxxx-xxxx-1xxx-[89ab]xxx-xxxxxxxxxxxx
const TIMEUUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-1[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/**
 * Extract the 60-bit Gregorian 100-nanosecond timestamp from a UUIDv1
 * (Cassandra TIMEUUID) string.
 *
 * @param value - A candidate TIMEUUID string.
 * @returns The 60-bit timestamp, or `undefined` if `value` is not a TIMEUUID.
 */
function parseTimeuuidTicks(value: string): bigint | undefined {
  if (!TIMEUUID_REGEX.test(value)) {
    return undefined;
  }
  const timeLow = value.slice(0, 8);
  const timeMid = value.slice(9, 13);
  // Skip the version nibble ('1') at index 14 to get the 12 most significant bits.
  const timeHi = value.slice(15, 18);
  return BigInt(`0x${timeHi}${timeMid}${timeLow}`);
}

/**
 * Parse a `createdAt` string (Cassandra TIMEUUID, numeric milliseconds, or ISO
 * date string) onto a shared 100-nanosecond Gregorian timeline so comparisons
 * preserve full 60-bit TIMEUUID precision.
 *
 * @param createdAt - The raw `createdAt` value.
 * @returns 100-nanosecond ticks since 1582-10-15T00:00:00Z, or `undefined` when unknown.
 */
function parseCreatedAtTicks(
  createdAt: string | undefined,
): bigint | undefined {
  if (createdAt === undefined) {
    return undefined;
  }
  const timeuuidTicks = parseTimeuuidTicks(createdAt);
  if (timeuuidTicks !== undefined) {
    return timeuuidTicks;
  }
  if (createdAt.trim() === '') {
    return undefined;
  }
  const asNumber = Number(createdAt);
  const ms = Number.isFinite(asNumber) ? asNumber : Date.parse(createdAt);
  if (!Number.isFinite(ms)) {
    return undefined;
  }
  return BigInt(Math.trunc(ms)) * TICKS_PER_MS + GREGORIAN_TO_UNIX_EPOCH_TICKS;
}

/**
 * @param item - A fetched item.
 * @returns The item's creation time in milliseconds since the Unix epoch, or 0 when unknown.
 */
export function getCreatedAtMs(item: FetchedSecretDataItem): number {
  const ticks = parseCreatedAtTicks(item.createdAt);
  if (ticks === undefined) {
    return 0;
  }
  return Number((ticks - GREGORIAN_TO_UNIX_EPOCH_TICKS) / TICKS_PER_MS);
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
    .map((item, index) => ({
      item,
      index,
      createdAtTicks: parseCreatedAtTicks(item.createdAt),
    }))
    .sort((a, b) => {
      if (a.createdAtTicks !== b.createdAtTicks) {
        if (a.createdAtTicks === undefined) {
          return 1;
        }
        if (b.createdAtTicks === undefined) {
          return -1;
        }
        return b.createdAtTicks > a.createdAtTicks ? 1 : -1;
      }
      return b.index - a.index;
    })
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
 * Find the local backup metadata entry for secret data.
 *
 * @param currentBackupsMetadata - Existing backup metadata in controller state.
 * @param data - The secret data to find.
 * @param type - The type of the secret data.
 * @returns The matching backup metadata, if present.
 */
export function findSocialBackupMetadata(
  currentBackupsMetadata: SocialBackupsMetadata[],
  data: Uint8Array,
  type: SecretType = SecretType.Mnemonic,
): SocialBackupsMetadata | undefined {
  const backupHash = keccak256AndHexify(data);
  return currentBackupsMetadata.find(
    (backup) => backup.hash === backupHash && backup.type === type,
  );
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
