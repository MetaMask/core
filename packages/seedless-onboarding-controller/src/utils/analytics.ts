import type {
  AnalyticsContext,
  AnalyticsTrackingEvent,
} from '@metamask/analytics-controller';
import type { FetchedSecretDataItem } from '@metamask/toprf-secure-backup';
import { areUint8ArraysEqual } from '@metamask/utils';

import {
  controllerName,
  IDENTITY_MISMATCH_REASON_BY_DETAIL,
  SecretType,
  SeedlessIdentityMismatchEventName,
  SeedlessIdentityMismatchReason,
} from '../constants.js';
import type { SeedlessIdentityMismatchSource } from '../constants.js';
import {
  InvalidPrimarySecretDataTypeError,
  isIdentityMismatchError,
} from '../errors.js';
import { createModuleLogger, projectLogger } from '../logger.js';
import { SecretMetadata } from '../SecretMetadata.js';
import {
  assertIdentityUnchanged,
  assertIdTokenMatchesUserId,
} from './assertions.js';
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
 * Report an identity mismatch. Tracking failures are logged and do not
 * replace the original error.
 *
 * @param params - The mismatch and the analytics callbacks.
 * @param params.source - The flow that detected the mismatch.
 * @param params.error - The caught identity mismatch.
 * @param params.trackEvent - Emits a non-sensitive analytics event.
 */
export function trackIdentityMismatchEvent({
  source,
  error,
  trackEvent,
}: {
  source: SeedlessIdentityMismatchSource;
  error: unknown;
  trackEvent: TrackEvent;
}): void {
  if (!isIdentityMismatchError(error)) {
    return;
  }

  try {
    const tracked = trackEvent({
      name: SeedlessIdentityMismatchEventName,
      properties: {
        source,
        reason:
          IDENTITY_MISMATCH_REASON_BY_DETAIL[error.details ?? ''] ??
          SeedlessIdentityMismatchReason.Unknown,
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

/**
 * Assert the first id token belongs to `userId`, and report a mismatch.
 * The original error is rethrown. A tracking failure does not replace it.
 *
 * @param params - The tokens, expected user, and analytics callbacks.
 * @param params.idTokens - Id tokens to check. Only the first is validated.
 * @param params.userId - The user id the token should belong to.
 * @param params.source - The flow that is checking the token.
 * @param params.trackEvent - Emits a non-sensitive analytics event.
 */
export function trackIdTokenMismatchEvent({
  idTokens,
  userId,
  source,
  trackEvent,
}: {
  idTokens: string[];
  userId: string | null | undefined;
  source: SeedlessIdentityMismatchSource;
  trackEvent: TrackEvent;
}): asserts userId is string {
  try {
    assertIdTokenMatchesUserId(idTokens, userId);
  } catch (error) {
    trackIdentityMismatchEvent({ source, error, trackEvent });
    throw error;
  }
}

/**
 * Assert the controller identity is unchanged, and report a mismatch.
 * The original error is rethrown. A tracking failure does not replace it.
 *
 * @param params - The identities being compared and the analytics callbacks.
 * @param params.currentState - Identity fields from the current controller state.
 * @param params.expectedIdentity - Identity fields captured before the request.
 * @param params.source - The flow that is checking the identity.
 * @param params.trackEvent - Emits a non-sensitive analytics event.
 */
export function trackIdentityUnchangedEvent({
  currentState,
  expectedIdentity,
  source,
  trackEvent,
}: {
  currentState: {
    userId?: string;
    authConnectionId?: string;
  };
  expectedIdentity: {
    userId?: string;
    authConnectionId?: string;
  };
  source: SeedlessIdentityMismatchSource;
  trackEvent: TrackEvent;
}): void {
  try {
    assertIdentityUnchanged(currentState, expectedIdentity);
  } catch (error) {
    trackIdentityMismatchEvent({ source, error, trackEvent });
    throw error;
  }
}
