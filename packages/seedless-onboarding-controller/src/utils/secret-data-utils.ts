import { keccak256AndHexify } from '@metamask/auth-network-utils';
import type { FetchedSecretDataItem } from '@metamask/toprf-secure-backup';
import { EncAccountDataType } from '@metamask/toprf-secure-backup';
import { areUint8ArraysEqual } from '@metamask/utils';

import {
  controllerName,
  PrimarySrpRepairType,
  SecretType,
} from '../constants.js';
import { parseControlRecord } from '../envelope/envelope-keys.js';
import type { ControlRecord } from '../envelope/envelope-keys.js';
import { createModuleLogger, projectLogger } from '../logger.js';
import { SecretMetadata } from '../SecretMetadata.js';
import type {
  MetadataSchemaVersion,
  PrimarySrpRepairPlan,
  PrimarySrpRepairWrites,
  SocialBackupsMetadata,
} from '../types.js';
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
 * Get the storage schema version of a secret metadata backup.
 *
 * `v2` is only reported when every item is stored as v2, and `v1` when every
 * item is stored as v1.
 *
 * @param secretMetadata - Parsed secret metadata.
 * @returns The schema version of the backup.
 */
export function getMetadataSchemaVersion(
  secretMetadata: SecretMetadata[],
): MetadataSchemaVersion {
  if (secretMetadata.length === 0) {
    // No secret metadata found.
    return 'none';
  }

  if (secretMetadata.every((secret) => secret.storageVersion === 'v2')) {
    return 'v2';
  }

  if (secretMetadata.every((secret) => secret.storageVersion === 'v1')) {
    return 'v1';
  }

  return 'mixed';
}

/**
 * Compare the remote primary SRP backup with the local primary SRP, and decide
 * which repair applies.
 *
 * Legacy metadata is ordered by the client-side timestamp and its first
 * mnemonic is treated as the remote primary candidate. Newer metadata uses the
 * explicit `PrimarySrp` data type. When no mnemonic can be the primary the
 * backup is `missing`, otherwise the candidate is compared with the local
 * primary SRP and a difference is a `mismatch`. The plan also reports the
 * schema version of the remote backup, so a repair can write the same schema.
 *
 * This only reads data. It does not modify local or remote backup data. Fetch,
 * parsing, and keyring failures are logged and result in no plan.
 *
 * @param params - Functions used to read the remote metadata and the local
 * primary SRP.
 * @param params.fetchAllSecretDataFn - Fetches the decrypted remote secret
 * metadata items.
 * @param params.getPrimaryKeyringSeedPhraseFn - Returns the local primary SRP
 * bytes from the keyring.
 * @returns The repair plan, or `undefined` if the backup is in sync or could
 * not be read.
 */
export async function planPrimarySrpRepair({
  fetchAllSecretDataFn,
  getPrimaryKeyringSeedPhraseFn,
}: {
  fetchAllSecretDataFn: () => Promise<FetchedSecretDataItem[]>;
  getPrimaryKeyringSeedPhraseFn: () => Promise<Uint8Array>;
}): Promise<PrimarySrpRepairPlan | undefined> {
  let secretMetadata: SecretMetadata[] = [];
  let localPrimarySRP: Uint8Array | undefined;
  try {
    const secretDataItems = await fetchAllSecretDataFn();
    secretMetadata = parseSecretMetadata(secretDataItems);
    // Read once up front, so both the mismatch and missing results reuse it.
    localPrimarySRP = await getPrimaryKeyringSeedPhraseFn();

    const [primarySecretMetadata] =
      validateSecretMetadataBackup(secretMetadata);
    if (areUint8ArraysEqual(primarySecretMetadata.data, localPrimarySRP)) {
      return undefined;
    }

    return {
      repairType: PrimarySrpRepairType.Mismatch,
      secretMetadata,
      metadataSchemaVersion: getMetadataSchemaVersion(secretMetadata),
      localPrimarySRP,
    };
  } catch (error) {
    // No mnemonic can be used as the primary secret, so the primary SRP is
    // missing and the local primary SRP read above is the data to write.
    if (error instanceof InvalidPrimarySecretDataTypeError && localPrimarySRP) {
      return {
        repairType: PrimarySrpRepairType.Missing,
        secretMetadata,
        metadataSchemaVersion: getMetadataSchemaVersion(secretMetadata),
        localPrimarySRP,
      };
    }

    log('Error planning primary SRP repair', error);
    return undefined;
  }
}

/**
 * Decide the remote writes that make the local primary SRP the remote primary
 * SRP, for a missing or mismatched primary SRP.
 *
 * Every remote secret item except the local primary SRP is retagged as
 * imported, which demotes the old primary. Items that are already imported are
 * left alone. The retag stores every changed item as `v2`, so a `v1` backup is
 * migrated. The local primary SRP is then promoted from its remote copy, or
 * added if there is none.
 *
 * This is pure: it only reads the plan.
 *
 * @param plan - The plan from {@link planPrimarySrpRepair}.
 * @param plan.secretMetadata - The parsed remote backup.
 * @param plan.localPrimarySRP - The local primary SRP.
 * @returns The writes to apply in order.
 */
export function getPrimarySrpRepairWrites({
  secretMetadata,
  localPrimarySRP,
}: PrimarySrpRepairPlan): PrimarySrpRepairWrites {
  const localCopy = secretMetadata.find(
    (secret) =>
      SecretMetadata.matchesType(secret, SecretType.Mnemonic) &&
      areUint8ArraysEqual(secret.data, localPrimarySRP),
  );

  const retag: PrimarySrpRepairWrites['retag'] = [];
  for (const secret of secretMetadata) {
    if (secret === localCopy || !secret.itemId) {
      continue;
    }
    if (isPrimarySecretCandidate(secret)) {
      retag.push({
        itemId: secret.itemId,
        dataType: EncAccountDataType.ImportedSrp,
      });
    } else if (!secret.dataType) {
      // An untagged secret that can't be the primary is a legacy private key.
      retag.push({
        itemId: secret.itemId,
        dataType: EncAccountDataType.ImportedPrivateKey,
      });
    }
  }

  return {
    retag,
    primary: localCopy?.itemId
      ? { type: 'promote', itemId: localCopy.itemId }
      : { type: 'add' },
  };
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
