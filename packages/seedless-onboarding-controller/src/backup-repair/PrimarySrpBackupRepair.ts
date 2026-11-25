import type { AnalyticsTrackingEvent } from '@metamask/analytics-controller';
import type {
  FetchedSecretDataItem,
  KeyPair,
  ToprfSecureBackup,
} from '@metamask/toprf-secure-backup';
import { EncAccountDataType } from '@metamask/toprf-secure-backup';

import { controllerName, PrimarySrpRepairType } from '../constants.js';
import { createModuleLogger, projectLogger } from '../logger.js';
import { SecretMetadata } from '../SecretMetadata.js';
import type { MetadataSchemaVersion } from '../types.js';
import {
  assertIdentityUnchanged,
  planPrimarySrpRepair,
  trackIncompleteMetadataBackupEvents,
} from '../utils/index.js';

const log = createModuleLogger(projectLogger, controllerName);

/**
 * The identity fields a repair is planned for.
 */
type Identity = { userId?: string; authConnectionId?: string };

/**
 * The vault keys used to write to the metadata service.
 */
export type RepairVaultKeys = {
  toprfEncryptionKey: Uint8Array;
  toprfAuthKeyPair: KeyPair;
};

/**
 * Options for {@link PrimarySrpBackupRepair}.
 */
export type PrimarySrpBackupRepairOptions = {
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
 * service, reports it, and repairs a missing primary SRP.
 */
export class PrimarySrpBackupRepair {
  readonly #getToprfClient: PrimarySrpBackupRepairOptions['getToprfClient'];

  readonly #fetchAllSecretData: PrimarySrpBackupRepairOptions['fetchAllSecretData'];

  readonly #exportPrimarySeedPhrase: PrimarySrpBackupRepairOptions['exportPrimarySeedPhrase'];

  readonly #trackEvent: PrimarySrpBackupRepairOptions['trackEvent'];

  readonly #getIdentity: PrimarySrpBackupRepairOptions['getIdentity'];

  readonly #withRepairContext: PrimarySrpBackupRepairOptions['withRepairContext'];

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
  }: PrimarySrpBackupRepairOptions) {
    this.#getToprfClient = getToprfClient;
    this.#fetchAllSecretData = fetchAllSecretData;
    this.#exportPrimarySeedPhrase = exportPrimarySeedPhrase;
    this.#trackEvent = trackEvent;
    this.#getIdentity = getIdentity;
    this.#withRepairContext = withRepairContext;
  }

  /**
   * Identify an incomplete or mismatched primary SRP backup, report it, and
   * repair a missing primary SRP.
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

    const plan = await planPrimarySrpRepair({
      fetchAllSecretDataFn: this.#fetchAllSecretData,
      getPrimaryKeyringSeedPhraseFn: () =>
        this.#exportPrimarySeedPhrase(password),
    });

    await trackIncompleteMetadataBackupEvents({
      plan,
      trackEvent: this.#trackEvent,
    });

    if (plan?.repairType === PrimarySrpRepairType.Missing) {
      await this.#repairMissingPrimarySrpBackup({
        localPrimarySRP: plan.localPrimarySRP,
        metadataSchemaVersion: plan.metadataSchemaVersion,
        expectedIdentity,
      });
    }
  }

  /**
   * Write the local primary SRP to the metadata service as the remote primary
   * SRP.
   *
   * This is a best-effort repair: any failure is logged and never thrown, so
   * it can't block the unlock flow.
   *
   * @param params - The repair to apply.
   * @param params.localPrimarySRP - The primary SRP to write.
   * @param params.metadataSchemaVersion - The schema version of the remote
   * backup. The primary SRP is written as v1 only when the backup is v1, and
   * as v2 otherwise.
   * @param params.expectedIdentity - The identity the repair was planned for.
   * The repair is aborted if the identity changed in the meantime.
   */
  async #repairMissingPrimarySrpBackup({
    localPrimarySRP,
    metadataSchemaVersion,
    expectedIdentity,
  }: {
    localPrimarySRP: Uint8Array;
    metadataSchemaVersion: MetadataSchemaVersion;
    expectedIdentity: Identity;
  }): Promise<void> {
    try {
      await this.#withRepairContext(
        async ({ toprfEncryptionKey, toprfAuthKeyPair }) => {
          // The identity may have changed since the repair was planned.
          assertIdentityUnchanged(this.#getIdentity(), expectedIdentity);

          // A v1 backup has not been migrated, so it must stay on the legacy
          // schema: an untagged mnemonic has no data type. Every other backup
          // (v2, none, mixed) is written as v2 with the `PrimarySrp` data type.
          const dataType =
            metadataSchemaVersion === 'v1'
              ? undefined
              : EncAccountDataType.PrimarySrp;
          const primarySecretMetadata = new SecretMetadata(localPrimarySRP, {
            dataType,
          });
          await this.#getToprfClient().addSecretDataItem({
            encKey: toprfEncryptionKey,
            secretData: primarySecretMetadata.toBytes(),
            authKeyPair: toprfAuthKeyPair,
            dataType,
          });
        },
      );
    } catch (error) {
      log('Error repairing missing primary SRP backup', error);
    }
  }
}
