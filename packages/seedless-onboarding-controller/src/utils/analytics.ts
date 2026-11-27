import type {
  AnalyticsContext,
  AnalyticsTrackingEvent,
} from '@metamask/analytics-controller';
import { bytesToHex, stringToBytes } from '@metamask/utils';
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';

import {
  controllerName,
  PrimarySrpRepairEventStatus,
  PrimarySrpRepairFailureReason,
  PrimarySrpRepairFailureStage,
  PrimarySrpRepairPrimaryWrite,
  PrimarySrpRepairType,
  SecretType,
  SeedlessIdentityMismatchEventName,
  SeedlessIdentityMismatchReason,
  SeedlessIdentityUserIdSalt,
  SeedlessOnboardingMigrationVersion,
  SeedlessPrimarySrpMismatchEventName,
  SeedlessPrimarySrpMissingEventName,
  SeedlessPrimarySrpRepairEventName,
} from '../constants.js';
import type { SeedlessIdentityMismatchSource } from '../constants.js';
import { createModuleLogger, projectLogger } from '../logger.js';
import { SecretMetadata } from '../SecretMetadata.js';
import type {
  MetadataSchemaVersion,
  PrimarySrpRepairPlan,
  PrimarySrpRepairResult,
} from '../types.js';
import { isIdentityMismatchError } from './errors.js';
import {
  getMetadataSchemaVersion,
  isPrimarySecretCandidate,
} from './secret-data-utils.js';

export const SeedlessEnvelopeMigrationCheckpointEventName =
  'Seedless Onboarding Envelope Migration Checkpoint';

export type IncompleteMetadataBackupEventProperties = {
  metadata_schema_version: MetadataSchemaVersion;
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
 * Report a missing or mismatched primary SRP in the remote TOPRF metadata
 * backup.
 *
 * The comparison of the remote backup with the local primary SRP is done when
 * the repair is planned. This function only maps the plan to a telemetry event
 * and emits it. It does not read or modify local or remote backup data.
 * Tracking failures are logged and never thrown.
 *
 * @param params - The repair plan and the function to emit telemetry.
 * @param params.plan - The repair plan. Nothing is tracked when it is
 * `undefined`.
 * @param params.trackEvent - Emits a non-sensitive analytics event.
 * @returns A promise that resolves after the best-effort telemetry has
 * completed.
 */
export async function trackIncompleteMetadataBackupEvents({
  plan,
  trackEvent,
}: {
  plan: PrimarySrpRepairPlan | undefined;
  trackEvent: TrackEvent;
}): Promise<void> {
  if (!plan) {
    return;
  }

  try {
    await trackEvent({
      name:
        plan.repairType === PrimarySrpRepairType.Missing
          ? SeedlessPrimarySrpMissingEventName
          : SeedlessPrimarySrpMismatchEventName,
      properties: getIncompleteMetadataBackupEventProperties(
        plan.secretMetadata,
      ),
      sensitiveProperties: {},
      saveDataRecording: false,
      hasProperties: true,
    });
  } catch (error) {
    log('Error tracking incomplete metadata backup event', error);
  }
}

/**
 * Properties of the primary SRP repair event. Each status sends only the
 * fields that apply to it.
 */
export type PrimarySrpRepairEventProperties = {
  status: PrimarySrpRepairEventStatus;
  repair_type?: PrimarySrpRepairType;
  metadata_schema_version?: MetadataSchemaVersion;
  number_of_imported_wallets?: number;
  number_of_imported_accounts?: number;
  primary_write?: PrimarySrpRepairPrimaryWrite;
  number_of_retagged_items?: number;
  failure_stage?: PrimarySrpRepairFailureStage;
  failure_reason?: PrimarySrpRepairFailureReason;
};

/**
 * Remove the fields that are `undefined`.
 *
 * @param value - The object to copy.
 * @returns A copy of `value` without the `undefined` fields.
 */
function omitUndefined<Value extends object>(value: Value): Value {
  const entries = Object.entries(value).filter(
    ([, entry]) => entry !== undefined,
  );
  return Object.fromEntries(entries) as Value;
}

/**
 * Report the start, success or failure of a primary SRP repair.
 *
 * A `started` event includes the backup summary from `plan`. Unset fields are
 * not sent. Tracking failures are logged and never thrown.
 *
 * @param params - The repair status and the function to emit telemetry.
 * @param params.status - Whether the repair started, succeeded or failed.
 * @param params.plan - The repair plan.
 * @param params.result - The repair outcome.
 * @param params.trackEvent - Emits a non-sensitive analytics event.
 * @returns A promise that resolves after the best-effort telemetry has
 * completed.
 */
export async function trackPrimarySrpRepairEvent({
  status,
  plan,
  result = {},
  trackEvent,
}: {
  status: PrimarySrpRepairEventStatus;
  plan?: PrimarySrpRepairPlan;
  result?: PrimarySrpRepairResult;
  trackEvent: TrackEvent;
}): Promise<void> {
  const backupSummary =
    status === PrimarySrpRepairEventStatus.Started && plan
      ? getIncompleteMetadataBackupEventProperties(plan.secretMetadata)
      : {};
  const properties = omitUndefined<PrimarySrpRepairEventProperties>({
    status,
    repair_type: plan?.repairType,
    ...backupSummary,
    primary_write: result.primaryWrite,
    number_of_retagged_items: result.numberOfRetaggedItems,
    failure_stage: result.failureStage,
    failure_reason: result.failureReason,
  });

  try {
    await trackEvent({
      name: SeedlessPrimarySrpRepairEventName,
      properties,
      sensitiveProperties: {},
      saveDataRecording: false,
      hasProperties: true,
    });
  } catch (error) {
    log('Error tracking primary SRP repair event', error);
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
