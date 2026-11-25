import type {
  EnvelopeKeys,
  FetchedSecretDataItem,
  KeyPair,
  ToprfSecureBackup,
} from '@metamask/toprf-secure-backup';
import { EncAccountDataType } from '@metamask/toprf-secure-backup';

import {
  controllerName,
  SeedlessOnboardingControllerErrorMessage,
} from '../constants.js';
import { createModuleLogger, projectLogger } from '../logger.js';
import { SeedlessOnboardingError } from '../utils/errors.js';
import { isAuthTokenError } from '../utils/index.js';
import {
  sortNewestFirst,
  splitVaultItems,
} from '../utils/secret-data-utils.js';
import {
  parseEnvelope,
  serializeControlRecord,
  serializeEnvelope,
} from './envelope-keys.js';
import type {
  ControlRecord,
  Envelope,
  EnvelopePath,
  VaultKeySet,
} from './envelope-keys.js';

const log = createModuleLogger(projectLogger, controllerName);

/**
 * Parse every envelope item for `path`, skipping malformed or mismatched-path
 * ones.
 *
 * @param items - The fetched items, newest first.
 * @param path - The expected path of the envelopes.
 * @returns The parsed envelopes for `path`, in the order of `items`.
 * @throws `InvalidEnvelope` if `KeyEnvelope` items are present but none parse
 * for `path`.
 */
function parseEnvelopeItems(
  items: FetchedSecretDataItem[],
  path: EnvelopePath,
): Envelope[] {
  const envelopes: Envelope[] = [];
  let hasEnvelopeItem = false;
  for (const item of items) {
    if (item.dataType !== EncAccountDataType.KeyEnvelope) {
      continue;
    }
    hasEnvelopeItem = true;
    try {
      const envelope = parseEnvelope(item.data);
      if (envelope.path === path) {
        envelopes.push(envelope);
      } else {
        log('Ignoring envelope item for unexpected path', {
          expectedPath: path,
          actualPath: envelope.path,
        });
      }
    } catch (error) {
      log('Ignoring malformed envelope item', error);
    }
  }
  if (hasEnvelopeItem && envelopes.length === 0) {
    throw new SeedlessOnboardingError(
      SeedlessOnboardingControllerErrorMessage.InvalidEnvelope,
    );
  }
  return envelopes;
}

/**
 * Reads and writes the envelope items (`pbek`, `rbek`) and the control
 * records at the Metadata Service. Each envelope sits alone in its own
 * partition. Control records share the vault partition with the secrets,
 * under the vault keys. Item ids are content hashes, so every write adds an
 * item and readers choose among all items of the partition.
 *
 * Fetch errors are thrown, never reported as "absent" (I6).
 */
export class EnvelopeStore {
  readonly #getToprfClient: () => ToprfSecureBackup;

  /**
   * @param options - The options.
   * @param options.getToprfClient - Returns the current TOPRF client. A getter
   * is used so the client is resolved at call time.
   */
  constructor({ getToprfClient }: { getToprfClient: () => ToprfSecureBackup }) {
    this.#getToprfClient = getToprfClient;
  }

  /**
   * Fetch the envelopes in a partition.
   *
   * @param keys - The envelope keys of the partition.
   * @param path - The path of the envelopes.
   * @returns The well-formed envelopes of the path, newest first.
   * @throws The auth token error as-is, `InvalidEnvelope` if `KeyEnvelope`
   * items are present but none parse for `path`, or `FailedToFetchSecretMetadata`.
   */
  async fetchEnvelopes(
    keys: EnvelopeKeys,
    path: EnvelopePath,
  ): Promise<Envelope[]> {
    const items = await this.#fetchItems(keys.wrapKey, keys.authKeyPair);
    return parseEnvelopeItems(sortNewestFirst(items), path);
  }

  /**
   * Add an envelope to its partition.
   *
   * @param keys - The envelope keys of the partition.
   * @param envelope - The envelope.
   */
  async writeEnvelope(keys: EnvelopeKeys, envelope: Envelope): Promise<void> {
    await this.#getToprfClient().addSecretDataItem({
      encKey: keys.wrapKey,
      authKeyPair: keys.authKeyPair,
      secretData: serializeEnvelope(envelope),
      dataType: EncAccountDataType.KeyEnvelope,
    });
  }

  /**
   * Fetch all items of a vault partition, split into secret items and
   * well-formed control records.
   *
   * @param vaultKeySet - The vault key set (K_v).
   * @returns The secret items and the well-formed control records, newest first.
   * @throws The auth token error as-is, or `FailedToFetchSecretMetadata`.
   */
  async fetchVaultItems(vaultKeySet: VaultKeySet): Promise<{
    secretItems: FetchedSecretDataItem[];
    controlRecords: ControlRecord[];
  }> {
    const items = await this.#fetchItems(
      vaultKeySet.encKey,
      vaultKeySet.authKeyPair,
    );
    return splitVaultItems(items);
  }

  /**
   * Fetch the control records of a vault from the vault partition. The
   * secrets of the partition are ignored.
   *
   * @param vaultKeySet - The vault key set (K_v).
   * @returns The well-formed control records, newest first.
   * @throws The auth token error as-is, or `FailedToFetchSecretMetadata`.
   */
  async fetchControlRecords(
    vaultKeySet: VaultKeySet,
  ): Promise<ControlRecord[]> {
    return (await this.fetchVaultItems(vaultKeySet)).controlRecords;
  }

  /**
   * Add a control record to the vault partition. The caller must hold the
   * vault partition's metadata lock and pass its id: the Metadata Service
   * only accepts batch writes under the lock, rejects single writes while the
   * partition is locked, and rejects a second lock on a locked partition.
   *
   * @param vaultKeySet - The vault key set (K_v).
   * @param record - The control record.
   * @param lockId - The id of the vault partition's metadata lock.
   */
  async writeControlRecord(
    vaultKeySet: VaultKeySet,
    record: ControlRecord,
    lockId: string,
  ): Promise<void> {
    await this.#getToprfClient().batchAddSecretDataItems({
      secretData: [
        {
          data: serializeControlRecord(record),
          dataType: EncAccountDataType.EnvelopeControl,
        },
      ],
      encKey: vaultKeySet.encKey,
      authKeyPair: vaultKeySet.authKeyPair,
      lockId,
    });
  }

  /**
   * Fetch all items of a partition.
   *
   * @param decKey - The decryption key of the partition.
   * @param authKeyPair - The auth key pair of the partition.
   * @returns The items, in the order the Metadata Service returned them.
   * @throws The auth token error as-is, or `FailedToFetchSecretMetadata`.
   */
  async #fetchItems(
    decKey: Uint8Array,
    authKeyPair: KeyPair,
  ): Promise<FetchedSecretDataItem[]> {
    try {
      return await this.#getToprfClient().fetchAllSecretDataItems({
        decKey,
        authKeyPair,
      });
    } catch (error) {
      log('Error fetching envelope items', error);
      if (isAuthTokenError(error)) {
        throw error;
      }
      throw new SeedlessOnboardingError(
        SeedlessOnboardingControllerErrorMessage.FailedToFetchSecretMetadata,
        { cause: error },
      );
    }
  }
}
