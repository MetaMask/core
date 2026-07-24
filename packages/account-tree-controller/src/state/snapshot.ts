import type {
  AccountGroupPayloadId,
  AccountTreePayload,
  AccountTreeSnapshotEntry,
  AccountWalletPayloadId,
} from './payload.js';
import {
  ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION,
  validateAndMigrate,
} from './payload.js';

type SnapshotIdMap = {
  /** Maps local controller IDs (wallet or group) to their portable payload IDs. */
  localToPayload: Map<string, string>;
  /** Maps portable payload IDs to their local controller IDs. */
  payloadToLocal: Map<string, string>;
};

/**
 * Immutable value object returned by {@link AccountTreeController.exportState}.
 *
 * Holds an ID map (local ↔ payload) populated during export so callers can
 * bridge between internal controller IDs and the stable cross-device IDs that
 * appear in the serialized payload. The map is absent for snapshots produced
 * by {@link AccountTreeSnapshot.deserialize} — `toLocalId` / `toPayloadId`
 * return `undefined` in that case.
 */
export class AccountTreeSnapshot {
  readonly #entries: AccountTreeSnapshotEntry[];

  readonly #idMap: SnapshotIdMap | null;

  constructor(
    entries: AccountTreeSnapshotEntry[],
    idMap: SnapshotIdMap | null,
  ) {
    this.#entries = entries;
    this.#idMap = idMap;
  }

  /**
   * Returns a new snapshot containing only the wallet entries for which
   * `predicate` returns `true`. The ID map is pruned to match.
   *
   * @param predicate - Function called with each wallet entry.
   * @returns A filtered snapshot.
   */
  filter(
    predicate: (entry: AccountTreeSnapshotEntry) => boolean,
  ): AccountTreeSnapshot {
    const filteredEntries = this.#entries.filter(predicate);

    if (!this.#idMap) {
      return new AccountTreeSnapshot(filteredEntries, null);
    }

    const localToPayload = new Map<string, string>();
    const payloadToLocal = new Map<string, string>();

    for (const entry of filteredEntries) {
      const localWalletId = this.#idMap.payloadToLocal.get(entry.id);
      if (localWalletId !== undefined) {
        localToPayload.set(localWalletId, entry.id);
        payloadToLocal.set(entry.id, localWalletId);
      }
      for (const group of entry.groups) {
        const localGroupId = this.#idMap.payloadToLocal.get(group.id);
        if (localGroupId !== undefined) {
          localToPayload.set(localGroupId, group.id);
          payloadToLocal.set(group.id, localGroupId);
        }
      }
    }

    return new AccountTreeSnapshot(filteredEntries, { localToPayload, payloadToLocal });
  }

  /**
   * Converts a payload ID (wallet or group) to the corresponding local
   * `AccountTreeController` ID.
   *
   * @param payloadId - Payload wallet or group ID.
   * @returns The local ID, or `undefined` if not found or no ID map is present.
   */
  toLocalId(
    payloadId: AccountWalletPayloadId | AccountGroupPayloadId,
  ): string | undefined {
    return this.#idMap?.payloadToLocal.get(payloadId);
  }

  /**
   * Converts a local `AccountTreeController` ID (wallet or group) to its
   * payload ID.
   *
   * @param localId - Local wallet or group ID.
   * @returns The payload ID, or `undefined` if not found or no ID map is present.
   */
  toPayloadId(
    localId: string,
  ): AccountWalletPayloadId | AccountGroupPayloadId | undefined {
    return this.#idMap?.localToPayload.get(localId) as
      | AccountWalletPayloadId
      | AccountGroupPayloadId
      | undefined;
  }

  /**
   * Serializes the snapshot to a versioned {@link AccountTreePayload}.
   *
   * @returns The versioned payload.
   */
  serialize(): AccountTreePayload {
    return {
      version: ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION,
      wallets: this.#entries,
    };
  }

  /**
   * Deserializes and validates a raw value as an `AccountTreePayload`,
   * running any necessary version migrations.
   *
   * The returned snapshot has no ID map — `toLocalId` / `toPayloadId` return
   * `undefined`. Use `AccountTreeController.exportState` when you need the map.
   *
   * @param raw - Unknown value to parse.
   * @returns A migrated snapshot.
   * @throws If `raw` is not a valid payload or its version exceeds the current version.
   */
  static deserialize(raw: unknown): AccountTreeSnapshot {
    const payload = validateAndMigrate(raw);
    return new AccountTreeSnapshot(payload.wallets, null);
  }
}
