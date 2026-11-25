import type { AnalyticsTrackingEvent } from '@metamask/analytics-controller';
import type {
  FetchedSecretDataItem,
  KeyPair,
  ToprfSecureBackup,
} from '@metamask/toprf-secure-backup';
import { EncAccountDataType } from '@metamask/toprf-secure-backup';

import { controllerName } from '../constants.js';
import { createModuleLogger, projectLogger } from '../logger.js';
import { SecretMetadata } from '../SecretMetadata.js';
import type { PrimarySrpRepairPlan } from '../types.js';
import {
  assertIdentityUnchanged,
  getPrimarySrpRepairWrites,
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
 * service, reports it, and repairs it.
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
   * repair it.
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

    if (plan) {
      await this.#repairPrimarySrpBackup(plan, expectedIdentity);
    }
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
      const { retag, primary } = getPrimarySrpRepairWrites(plan);

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
