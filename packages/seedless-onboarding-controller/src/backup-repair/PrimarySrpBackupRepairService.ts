import type { AnalyticsTrackingEvent } from '@metamask/analytics-controller';
import type {
  FetchedSecretDataItem,
  KeyPair,
  ToprfSecureBackup,
} from '@metamask/toprf-secure-backup';
import { EncAccountDataType } from '@metamask/toprf-secure-backup';
import { areUint8ArraysEqual } from '@metamask/utils';

import {
  controllerName,
  PrimarySrpRepairFailureReason,
  PrimarySrpRepairType,
  SecretType,
} from '../constants.js';
import { createModuleLogger, projectLogger } from '../logger.js';
import { SecretMetadata } from '../SecretMetadata.js';
import type { PrimarySrpRepairPlan, PrimarySrpRepairWrites } from '../types.js';
import {
  assertIdentityUnchanged,
  getMetadataSchemaVersion,
  InvalidPrimarySecretDataTypeError,
  isPrimarySecretCandidate,
  parseSecretMetadata,
  trackIncompleteMetadataBackupEvents,
  validateSecretMetadataBackup,
} from '../utils/index.js';

const log = createModuleLogger(projectLogger, controllerName);

/**
 * The identity fields a repair is planned for.
 */
type Identity = { userId?: string; authConnectionId?: string };

/**
 * The outcome of planning a repair. `plan` is set when a repair is needed,
 * `failureReason` when the backup could not be read, and neither when the
 * backup is in sync.
 */
type PrimarySrpRepairPlanResult = {
  plan?: PrimarySrpRepairPlan;
  failureReason?: PrimarySrpRepairFailureReason;
};

/**
 * The vault keys used to write to the metadata service.
 */
export type RepairVaultKeys = {
  toprfEncryptionKey: Uint8Array;
  toprfAuthKeyPair: KeyPair;
};

/**
 * Options for {@link PrimarySrpBackupRepairService}.
 */
export type PrimarySrpBackupRepairServiceOptions = {
  /**
   * Returns the current TOPRF client. A getter is used so the client is
   * resolved at call time.
   */
  getToprfClient: () => ToprfSecureBackup;
  /**
   * Fetches the decrypted remote secret data items.
   */
  fetchAllSecretData: () => Promise<FetchedSecretDataItem[]>;
  /**
   * Returns the local primary SRP bytes from the keyring.
   */
  exportPrimarySeedPhrase: (password: string) => Promise<Uint8Array>;
  /**
   * Emits a non-sensitive analytics event.
   */
  trackEvent: (event: AnalyticsTrackingEvent) => void | Promise<void>;
  /**
   * Returns the current identity fields from the controller state.
   */
  getIdentity: () => Identity;
  /**
   * Runs `fn` with the vault keys, under the controller lock, while unlocked,
   * with the password in sync, and with auth token refresh.
   */
  withRepairContext: (
    fn: (keys: RepairVaultKeys) => Promise<void>,
  ) => Promise<void>;
};

/**
 * Identifies an incomplete or mismatched primary SRP backup at the metadata
 * service, reports it, and repairs it.
 */
export class PrimarySrpBackupRepairService {
  readonly #getToprfClient: PrimarySrpBackupRepairServiceOptions['getToprfClient'];

  readonly #fetchAllSecretData: PrimarySrpBackupRepairServiceOptions['fetchAllSecretData'];

  readonly #exportPrimarySeedPhrase: PrimarySrpBackupRepairServiceOptions['exportPrimarySeedPhrase'];

  readonly #trackEvent: PrimarySrpBackupRepairServiceOptions['trackEvent'];

  readonly #getIdentity: PrimarySrpBackupRepairServiceOptions['getIdentity'];

  readonly #withRepairContext: PrimarySrpBackupRepairServiceOptions['withRepairContext'];

  /**
   * In-flight repair run and the identity it was started for, used to coalesce
   * overlapping calls for the same user.
   */
  #pendingRun: { identity: Identity; promise: Promise<void> } | undefined;

  /**
   * @param options - The options.
   * @param options.getToprfClient - Returns the current TOPRF client.
   * @param options.fetchAllSecretData - Fetches the remote secret data items.
   * @param options.exportPrimarySeedPhrase - Returns the local primary SRP.
   * @param options.trackEvent - Emits a non-sensitive analytics event.
   * @param options.getIdentity - Returns the current identity fields.
   * @param options.withRepairContext - Runs the repair write under the
   * controller's guards.
   */
  constructor({
    getToprfClient,
    fetchAllSecretData,
    exportPrimarySeedPhrase,
    trackEvent,
    getIdentity,
    withRepairContext,
  }: PrimarySrpBackupRepairServiceOptions) {
    this.#getToprfClient = getToprfClient;
    this.#fetchAllSecretData = fetchAllSecretData;
    this.#exportPrimarySeedPhrase = exportPrimarySeedPhrase;
    this.#trackEvent = trackEvent;
    this.#getIdentity = getIdentity;
    this.#withRepairContext = withRepairContext;
  }

  /**
   * Identify an incomplete or mismatched primary SRP backup, report it, and
   * repair it.
   *
   * Concurrent calls for the same identity share the in-flight run rather than
   * planning and writing twice.
   *
   * Never rejects, so it is safe to call without awaiting. It must not be
   * awaited while the controller lock is held: the repair takes that lock.
   *
   * @param password - The password used to export the local primary SRP.
   * @returns A promise that resolves after identification, telemetry and
   * repair have completed.
   */
  async run(password: string): Promise<void> {
    const expectedIdentity = this.#getIdentity();
    if (
      this.#pendingRun &&
      this.#pendingRun.identity.userId === expectedIdentity.userId &&
      this.#pendingRun.identity.authConnectionId ===
        expectedIdentity.authConnectionId
    ) {
      return await this.#pendingRun.promise;
    }

    const promise = this.#executeRun(password, expectedIdentity).finally(() => {
      if (this.#pendingRun?.promise === promise) {
        this.#pendingRun = undefined;
      }
    });
    this.#pendingRun = { identity: expectedIdentity, promise };
    return await promise;
  }

  /**
   * Execute one identification, telemetry, and repair pass for `expectedIdentity`.
   *
   * @param password - The password used to export the local primary SRP.
   * @param expectedIdentity - The identity this run was started for.
   */
  async #executeRun(
    password: string,
    expectedIdentity: Identity,
  ): Promise<void> {
    const { plan } = await this.#planRepair(password);

    await trackIncompleteMetadataBackupEvents({
      plan,
      trackEvent: this.#trackEvent,
    });

    if (plan) {
      await this.#repairPrimarySrpBackup(plan, expectedIdentity);
    }
  }

  /**
   * Compare the remote primary SRP backup with the local primary SRP, and
   * decide which repair applies.
   *
   * Legacy metadata is ordered by the client-side timestamp and its first
   * mnemonic is treated as the remote primary candidate. Newer metadata uses
   * the explicit `PrimarySrp` data type. When no mnemonic can be the primary
   * the backup is `missing`, otherwise the candidate is compared with the local
   * primary SRP and a difference is a `mismatch`.
   *
   * This only reads data. Each read step that fails is logged and returns the
   * matching `failureReason`, with no plan.
   *
   * @param password - The password used to export the local primary SRP.
   * @returns The plan when a repair is needed, the `failureReason` when the
   * backup could not be read, and neither when the backup is in sync.
   */
  async #planRepair(password: string): Promise<PrimarySrpRepairPlanResult> {
    let secretMetadata: SecretMetadata[];
    try {
      const remoteItems = await this.#fetchAllSecretData();
      secretMetadata = parseSecretMetadata(remoteItems);
    } catch (error) {
      log('Error planning primary SRP repair', error);
      return { failureReason: PrimarySrpRepairFailureReason.BackupUnreadable };
    }

    // Read once up front, so both the mismatch and missing results reuse it.
    let localPrimarySRP: Uint8Array;
    try {
      localPrimarySRP = await this.#exportPrimarySeedPhrase(password);
    } catch (error) {
      log('Error planning primary SRP repair', error);
      return { failureReason: PrimarySrpRepairFailureReason.ExportFailed };
    }

    try {
      const [primarySecretMetadata] =
        validateSecretMetadataBackup(secretMetadata);
      if (areUint8ArraysEqual(primarySecretMetadata.data, localPrimarySRP)) {
        return {};
      }

      return {
        plan: {
          repairType: PrimarySrpRepairType.Mismatch,
          secretMetadata,
          metadataSchemaVersion: getMetadataSchemaVersion(secretMetadata),
          localPrimarySRP,
        },
      };
    } catch (error) {
      // No mnemonic can be used as the primary secret, so the primary SRP is
      // missing and the local primary SRP read above is the data to write.
      if (error instanceof InvalidPrimarySecretDataTypeError) {
        return {
          plan: {
            repairType: PrimarySrpRepairType.Missing,
            secretMetadata,
            metadataSchemaVersion: getMetadataSchemaVersion(secretMetadata),
            localPrimarySRP,
          },
        };
      }

      // Safety net: validation only throws InvalidPrimarySecretDataTypeError,
      // so this is unreachable in normal flow. It keeps an unexpected error
      // from rejecting the run.
      /* istanbul ignore next */
      log('Error planning primary SRP repair', error);
      /* istanbul ignore next */
      return { failureReason: PrimarySrpRepairFailureReason.Unknown };
    }
  }

  /**
   * Decide the remote writes that make the local primary SRP the remote
   * primary SRP, for a missing or mismatched primary SRP.
   *
   * Every remote secret item except the local primary SRP is retagged as
   * imported, which demotes the old primary. Items that are already imported
   * are left alone. The retag stores every changed item as `v2`, so a `v1`
   * backup is migrated. The local primary SRP is then promoted from its remote
   * copy, or added if there is none.
   *
   * This is pure: it only reads the plan.
   *
   * @param plan - The repair plan.
   * @param plan.secretMetadata - The parsed remote backup.
   * @param plan.localPrimarySRP - The local primary SRP.
   * @returns The writes to apply in order.
   */
  static #getWrites({
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
   * Make the local primary SRP the remote primary SRP.
   *
   * The remote items are retagged first, which also demotes the old primary,
   * and the local primary SRP is then promoted or added. The two steps can't
   * be one request: the service rejects a new primary while another primary
   * item is stored. If the second step fails, the backup is left without a
   * primary SRP, which the next unlock repairs.
   *
   * This is a best-effort repair: any failure is logged and never thrown, so
   * it can't block the unlock flow.
   *
   * @param plan - The repair plan.
   * @param expectedIdentity - The identity the repair was planned for. The
   * repair is aborted if the identity changed in the meantime.
   */
  async #repairPrimarySrpBackup(
    plan: PrimarySrpRepairPlan,
    expectedIdentity: Identity,
  ): Promise<void> {
    try {
      const { retag, primary } = PrimarySrpBackupRepairService.#getWrites(plan);

      await this.#withRepairContext(
        async ({ toprfEncryptionKey, toprfAuthKeyPair }) => {
          // The identity may have changed since the repair was planned.
          assertIdentityUnchanged(this.#getIdentity(), expectedIdentity);

          const toprfClient = this.#getToprfClient();

          if (retag.length === 1) {
            await toprfClient.updateSecretDataItem({
              ...retag[0],
              authKeyPair: toprfAuthKeyPair,
            });
          } else if (retag.length > 1) {
            await toprfClient.batchUpdateSecretDataItems({
              updateItems: retag,
              authKeyPair: toprfAuthKeyPair,
            });
          }

          if (primary.type === 'promote') {
            // mismatched case; promote the local primary to remote primary
            await toprfClient.updateSecretDataItem({
              itemId: primary.itemId,
              dataType: EncAccountDataType.PrimarySrp,
              authKeyPair: toprfAuthKeyPair,
            });
          } else {
            // missing case; add the local primary to the remote backup
            const primarySecretMetadata = new SecretMetadata(
              plan.localPrimarySRP,
              { dataType: EncAccountDataType.PrimarySrp },
            );
            await toprfClient.addSecretDataItem({
              encKey: toprfEncryptionKey,
              secretData: primarySecretMetadata.toBytes(),
              authKeyPair: toprfAuthKeyPair,
              dataType: EncAccountDataType.PrimarySrp,
              version: 'v2',
            });
          }
        },
      );
    } catch (error) {
      log('Error repairing primary SRP backup', error);
    }
  }
}
