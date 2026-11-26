import type {
  AnalyticsContext,
  AnalyticsTrackingEvent,
} from '@metamask/analytics-controller';
import type { FetchedSecretDataItem } from '@metamask/toprf-secure-backup';
import {
  areUint8ArraysEqual,
  bytesToHex,
  stringToBytes,
} from '@metamask/utils';
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';

import {
  controllerName,
  SecretType,
  SeedlessIdentityMismatchEventName,
  SeedlessIdentityMismatchReason,
  SeedlessIdentityUserIdSalt,
  SeedlessOnboardingMigrationVersion,
  SeedlessPrimarySrpMismatchEventName,
  SeedlessPrimarySrpMissingEventName,
} from '../constants.js';
import type { SeedlessIdentityMismatchSource } from '../constants.js';
import { createModuleLogger, projectLogger } from '../logger.js';
import { SecretMetadata } from '../SecretMetadata.js';
import {
  InvalidPrimarySecretDataTypeError,
  isIdentityMismatchError,
} from './errors.js';
import {
  isPrimarySecretCandidate,
  parseSecretMetadata,
  validateSecretMetadataBackup,
} from './secret-data-utils.js';

export const SeedlessEnvelopeMigrationCheckpointEventName =
  'Seedless Onboarding Envelope Migration Checkpoint';

export type IncompleteMetadataBackupEventProperties = {
  metadata_schema_version: 'v1' | 'v2' | 'mixed' | 'none';
  number_of_imported_wallets: number;
  number_of_imported_accounts: number;
};

/**
 * Build non-sensitive properties describing an incomplete metadata backup.
 *
 * The primary mnemonic is omitted. Imported wallets are the remaining
 * mnemonics, including legacy mnemonics and `ImportedSrp` items. Imported
 * accounts are private keys. The schema version is `v2` when every item is
 * stored as v2.
 *
 * @param secretMetadata - Secret metadata returned by `parseSecretMetadata`.
 * @returns Analytics properties for the incomplete metadata backup events.
 */
export function getIncompleteMetadataBackupEventProperties(
  secretMetadata: SecretMetadata[],
): IncompleteMetadataBackupEventProperties {
  const primaryIndex = secretMetadata.findIndex(isPrimarySecretCandidate);
  let numberOfImportedWallets = 0;
  let numberOfImportedAccounts = 0;

  secretMetadata.forEach((secret, index) => {
    if (index === primaryIndex) {
      return;
    }

    if (SecretMetadata.matchesType(secret, SecretType.Mnemonic)) {
      numberOfImportedWallets += 1;
    } else if (SecretMetadata.matchesType(secret, SecretType.PrivateKey)) {
      numberOfImportedAccounts += 1;
    }
  });

  return {
    metadata_schema_version: getMetadataSchemaVersion(secretMetadata),
    number_of_imported_wallets: numberOfImportedWallets,
    number_of_imported_accounts: numberOfImportedAccounts,
  };
}

/**
 * Report `v2` only when every stored item already uses the v2 schema.
 *
 * @param secretMetadata - Parsed secret metadata.
 * @returns The metadata schema version to include in analytics.
 */
function getMetadataSchemaVersion(
  secretMetadata: SecretMetadata[],
):
  | IncompleteMetadataBackupEventProperties['metadata_schema_version']
  | 'mixed'
  | 'none' {
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
 * Map the controller migration version to the analytics schema version.
 *
 * @param migrationVersion - `state.migrationVersion`.
 * @returns `v2` once the v1 migration has run, otherwise `v1`.
 */
function getMetadataSchemaVersionFromMigration(
  migrationVersion: number,
): 'v1' | 'v2' {
  return migrationVersion >= SeedlessOnboardingMigrationVersion.V1
    ? 'v2'
    : 'v1';
}

const log = createModuleLogger(projectLogger, controllerName);

/**
 * Identify whether the local primary SRP is missing from or differs from the
 * remote TOPRF metadata backup.
 *
 * Legacy metadata is ordered by the client-side timestamp and its first
 * mnemonic is treated as the remote primary candidate. Newer metadata uses
 * the explicit `PrimarySrp` data type. The candidate is compared with the
 * primary SRP supplied by the keyring callback.
 *
 * This function only reads the supplied data and emits telemetry. It does not
 * modify local or remote backup data. Fetch, parsing, keyring, and comparison
 * failures are logged and are not classified as affected users.
 *
 * @param params - Functions used to read the remote metadata and local primary
 * SRP, and emit telemetry.
 * @param params.fetchAllSecretDataFn - Fetches the decrypted remote secret
 * metadata items.
 * @param params.getPrimaryKeyringSeedPhraseFn - Returns the local primary SRP
 * bytes from the keyring.
 * @param params.trackEvent - Emits a non-sensitive analytics event.
 * @returns A promise that resolves after identification and best-effort
 * telemetry have completed.
 */
export async function trackIncompleteMetadataBackupEvents({
  fetchAllSecretDataFn,
  getPrimaryKeyringSeedPhraseFn,
  trackEvent,
}: {
  fetchAllSecretDataFn: () => Promise<FetchedSecretDataItem[]>;
  trackEvent: TrackEvent;
  getPrimaryKeyringSeedPhraseFn: () => Promise<Uint8Array>;
}): Promise<void> {
  const trackEventSafely = async (
    event: AnalyticsTrackingEvent,
  ): Promise<void> => {
    try {
      await trackEvent(event);
    } catch (error) {
      log('Error tracking incomplete metadata backup event', error);
    }
  };

  let properties: IncompleteMetadataBackupEventProperties | undefined;

  try {
    const secretDataItems = await fetchAllSecretDataFn();
    const secretMetadata = parseSecretMetadata(secretDataItems);
    const eventProperties =
      getIncompleteMetadataBackupEventProperties(secretMetadata);
    properties = eventProperties;

    const [primarySecretMetadata] =
      validateSecretMetadataBackup(secretMetadata);
    const localPrimarySrp = await getPrimaryKeyringSeedPhraseFn();

    if (areUint8ArraysEqual(primarySecretMetadata.data, localPrimarySrp)) {
      return;
    }

    await trackEventSafely({
      name: SeedlessPrimarySrpMismatchEventName,
      properties: eventProperties,
      sensitiveProperties: {},
      saveDataRecording: false,
      hasProperties: true,
    });
  } catch (error) {
    if (error instanceof InvalidPrimarySecretDataTypeError && properties) {
      await trackEventSafely({
        name: SeedlessPrimarySrpMissingEventName,
        properties,
        sensitiveProperties: {},
        saveDataRecording: false,
        hasProperties: true,
      });

      return;
    }

    log('Error identifying incomplete metadata backup', error);
  }
}

type TrackEvent = (
  event: AnalyticsTrackingEvent,
  context?: AnalyticsContext,
) => void | Promise<void>;

/**
 * HMAC-SHA256 hex of a user id. A missing id is reported as `NONE`.
 *
 * @param userId - The user id to mask.
 * @returns The salted hash, or `NONE` when there is no user id.
 */
function hashUserId(userId?: string | null): string {
  if (!userId) {
    return 'NONE';
  }

  return bytesToHex(
    hmac(
      sha256,
      stringToBytes(SeedlessIdentityUserIdSalt),
      stringToBytes(userId),
    ),
  );
}

/**
 * Report an identity mismatch. Tracking failures are logged and do not
 * replace the original error.
 *
 * User ids are included only as salted HMAC-SHA256 hashes.
 *
 * @param params - The mismatch and the analytics callbacks.
 * @param params.source - The flow that detected the mismatch.
 * @param params.error - The caught identity mismatch.
 * @param params.trackEvent - Emits a non-sensitive analytics event.
 * @param params.expectedUserId - The user id the flow expected.
 * @param params.actualUserId - The user id it was compared with.
 * @param params.migrationVersion - Controller migration version from state.
 */
export function trackIdentityMismatchEvent({
  source,
  error,
  trackEvent,
  expectedUserId,
  actualUserId,
  migrationVersion = 0,
}: {
  source: SeedlessIdentityMismatchSource;
  error: unknown;
  trackEvent: TrackEvent;
  expectedUserId?: string | null;
  actualUserId?: string | null;
  migrationVersion?: number;
}): void {
  if (!isIdentityMismatchError(error)) {
    return;
  }

  const expectedUserIdHash = hashUserId(expectedUserId);
  const actualUserIdHash = hashUserId(actualUserId);

  try {
    const tracked = trackEvent({
      name: SeedlessIdentityMismatchEventName,
      properties: {
        source,
        reason:
          Object.values(SeedlessIdentityMismatchReason).find(
            (reason) => reason === error.details,
          ) ?? SeedlessIdentityMismatchReason.Unknown,
        expected_user_id: expectedUserIdHash,
        actual_user_id: actualUserIdHash,
        metadata_schema_version:
          getMetadataSchemaVersionFromMigration(migrationVersion),
      },
      sensitiveProperties: {},
      saveDataRecording: false,
      hasProperties: true,
    });
    if (tracked instanceof Promise) {
      tracked.catch((trackError: unknown) => {
        log('Error tracking identity mismatch event', trackError);
      });
    }
  } catch (trackError) {
    log('Error tracking identity mismatch event', trackError);
  }
}
