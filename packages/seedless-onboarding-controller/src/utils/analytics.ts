import type {
  AnalyticsContext,
  AnalyticsTrackingEvent,
} from '@metamask/analytics-controller';
import type { FetchedSecretDataItem } from '@metamask/toprf-secure-backup';
import { areUint8ArraysEqual } from '@metamask/utils';

import { SecretType } from '../constants.js';
import { InvalidPrimarySecretDataTypeError } from '../errors.js';
import { SecretMetadata } from '../SecretMetadata.js';
import {
  isPrimarySecretCandidate,
  parseSecretMetadata,
  validateSecretMetadataBackup,
} from './secret-data-utils.js';

export const SeedlessPrimarySrpMissingEventName =
  'Seedless Onboarding Primary SRP Missing';
export const SeedlessPrimarySrpMismatchEventName =
  'Seedless Onboarding Primary SRP Mismatch';

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
 * SRP, emit telemetry, and log inconclusive failures.
 * @param params.fetchAllSecretDataFn - Fetches the decrypted remote secret
 * metadata items.
 * @param params.getPrimaryKeyringSeedPhraseFn - Returns the local primary SRP
 * bytes from the keyring.
 * @param params.trackEvent - Emits a non-sensitive analytics event.
 * @param params.logFn - Records failures that prevent identification.
 * @returns A promise that resolves after identification and best-effort
 * telemetry have completed.
 */
export async function identifyIncompleteMetadataBackup({
  fetchAllSecretDataFn,
  getPrimaryKeyringSeedPhraseFn,
  trackEvent,
  logFn,
}: {
  fetchAllSecretDataFn: () => Promise<FetchedSecretDataItem[]>;
  trackEvent: (
    event: AnalyticsTrackingEvent,
    context?: AnalyticsContext,
  ) => void | Promise<void>;
  getPrimaryKeyringSeedPhraseFn: () => Promise<Uint8Array>;
  logFn: (message: string, error?: unknown) => void;
}): Promise<void> {
  const trackEventSafely = async (
    event: AnalyticsTrackingEvent,
  ): Promise<void> => {
    try {
      await trackEvent(event);
    } catch (error) {
      logFn('Error tracking incomplete metadata backup event', error);
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

    logFn('Error identifying incomplete metadata backup', error);
  }
}
