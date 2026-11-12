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
import { SeedlessOnboardingError } from '../errors.js';
import { createModuleLogger, projectLogger } from '../logger.js';
import { isAuthTokenError } from '../utils/index.js';
import {
  parseControlRecord,
  parseEnvelope,
  serializeControlRecord,
  serializeEnvelope,
} from './envelope-keys.js';
import type {
  ControlKeys,
  ControlRecord,
  Envelope,
  EnvelopePath,
} from './envelope-keys.js';

const log = createModuleLogger(projectLogger, controllerName);

/**
 * @param item - A fetched item.
 * @returns The item's creation time in milliseconds, or 0 when unknown.
 */
function getCreatedAtMs(item: FetchedSecretDataItem): number {
  if (item.createdAt === undefined) {
    return 0;
  }
  const asNumber = Number(item.createdAt);
  const ms = Number.isNaN(asNumber) ? Date.parse(item.createdAt) : asNumber;
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * Parse every item of a data type, skipping malformed ones.
 *
 * @param items - The fetched items, newest first.
 * @param dataType - The data type to keep.
 * @param parse - Parses the data of one item.
 * @returns The parsed items, in the order of `items`.
 */
function parseItems<Value>(
  items: FetchedSecretDataItem[],
  dataType: EncAccountDataType,
  parse: (data: Uint8Array) => Value,
): Value[] {
  const values: Value[] = [];
  for (const item of items) {
    if (item.dataType !== dataType) {
      continue;
    }
    try {
      values.push(parse(item.data));
    } catch (error) {
      log('Ignoring malformed envelope item', error);
    }
  }
  return values;
}

/**
 * Reads and writes the envelope items (`pbek`, `rbek`) and the control
 * records at the Metadata Service. Each kind sits alone in its own partition.
 * Item ids are content hashes, so every write adds an item and readers choose
 * among all items of the partition.
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
   * @throws The auth token error as-is, or `FailedToFetchSecretMetadata`.
   */
  async fetchEnvelopes(
    keys: EnvelopeKeys,
    path: EnvelopePath,
  ): Promise<Envelope[]> {
    const items = await this.#fetchItems(keys.wrapKey, keys.authKeyPair);
    return parseItems(
      items,
      EncAccountDataType.KeyEnvelope,
      parseEnvelope,
    ).filter((envelope) => envelope.path === path);
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
   * Fetch the control records of a vault.
   *
   * @param keys - The control keys of the vault.
   * @returns The well-formed control records, newest first.
   * @throws The auth token error as-is, or `FailedToFetchSecretMetadata`.
   */
  async fetchControlRecords(keys: ControlKeys): Promise<ControlRecord[]> {
    const items = await this.#fetchItems(keys.ctrlKey, keys.ctrlAuth);
    return parseItems(
      items,
      EncAccountDataType.EnvelopeControl,
      parseControlRecord,
    );
  }

  /**
   * Add a control record to the vault's control partition.
   *
   * @param keys - The control keys of the vault.
   * @param record - The control record.
   */
  async writeControlRecord(
    keys: ControlKeys,
    record: ControlRecord,
  ): Promise<void> {
    await this.#getToprfClient().addSecretDataItem({
      encKey: keys.ctrlKey,
      authKeyPair: keys.ctrlAuth,
      secretData: serializeControlRecord(record),
      dataType: EncAccountDataType.EnvelopeControl,
    });
  }

  /**
   * Fetch all items of a partition, newest first.
   *
   * @param decKey - The decryption key of the partition.
   * @param authKeyPair - The auth key pair of the partition.
   * @returns The items.
   * @throws The auth token error as-is, or `FailedToFetchSecretMetadata`.
   */
  async #fetchItems(
    decKey: Uint8Array,
    authKeyPair: KeyPair,
  ): Promise<FetchedSecretDataItem[]> {
    try {
      const items = await this.#getToprfClient().fetchAllSecretDataItems({
        decKey,
        authKeyPair,
      });
      return items
        .map((item, index) => ({ item, index }))
        .sort(
          (a, b) =>
            getCreatedAtMs(b.item) - getCreatedAtMs(a.item) ||
            b.index - a.index,
        )
        .map(({ item }) => item);
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
