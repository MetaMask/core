import type { IdMap } from './id-map.js';
import type {
  AccountGroupPayloadId,
  AccountTreePayload,
  AccountTreeSnapshotGroup,
  AccountTreeSnapshotWallet,
  AccountTreeWalletEntry,
  AccountWalletMnemonicGroupEntry,
  AccountWalletPayloadId,
  AccountWalletPrivateKeyGroupEntry,
} from './payload.js';
import {
  assertValidAccountTreePayload,
  ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION,
} from './payload.js';

/**
 * Recursively freezes a value and its nested properties.
 *
 * @param value - Value to freeze.
 * @returns The frozen value.
 */
function deepFreeze<Value>(value: Value): Value {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  Object.freeze(value);

  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }

  return value;
}

/**
 * Immutable value object returned by {@link AccountTreeController.exportState}.
 *
 * Construct with {@link AccountTreeController.exportState},
 * {@link AccountTreeSnapshot.deserialize}, or `new AccountTreeSnapshot(...)`
 * for tests and advanced use.
 *
 * Wallet and group entries are deep-cloned and deep-frozen once in the
 * constructor. Filtering predicates receive those read-only views directly;
 * each filter method returns a new snapshot that repeats the process for its
 * result.
 *
 * An optional ID map (local ↔ payload) may be supplied when bridging between
 * internal controller IDs and the stable cross-device IDs in the serialized
 * payload. The map covers the original export and is preserved unchanged
 * through filtering until {@link serialize}. Omit it when deterministic IDs
 * make {@link toLocalId} / {@link toPayloadId} unnecessary.
 */
export class AccountTreeSnapshot {
  readonly #entries: AccountTreeWalletEntry[];

  readonly #idMap: IdMap | undefined;

  /**
   * @param entries - Wallet entries in the snapshot.
   * @param idMap - Optional local ↔ payload ID map from export.
   */
  constructor(entries: AccountTreeWalletEntry[], idMap?: IdMap) {
    this.#entries = deepFreeze(structuredClone(entries));
    this.#idMap = idMap;
  }

  /**
   * Returns a new snapshot containing only the wallets for which
   * `predicate` returns `true`.
   *
   * When filtering by wallet ID, compare against stable payload IDs from
   * {@link serialize} or convert local IDs with {@link toPayloadId} first.
   *
   * @param predicate - Function called with each deeply read-only wallet entry.
   * @returns A filtered snapshot.
   */
  filterWallets(
    predicate: (wallet: AccountTreeSnapshotWallet) => boolean,
  ): AccountTreeSnapshot {
    const filteredEntries = this.#entries.filter((entry) =>
      predicate(entry as AccountTreeSnapshotWallet),
    );

    return new AccountTreeSnapshot(filteredEntries, this.#idMap);
  }

  /**
   * Filters groups within one wallet. Other wallets are left unchanged.
   *
   * Throws if `walletId` does not identify a wallet in the snapshot.
   * Removes the wallet if no groups remain after filtering — this prevents a
   * mnemonic wallet with zero selected groups from still transferring its secret.
   *
   * @param walletId - Stable payload wallet ID to filter groups within.
   * @param predicate - Function called with each deeply read-only group entry.
   * @returns A filtered snapshot.
   * @throws If `walletId` is not present in the snapshot.
   */
  filterGroups(
    walletId: AccountWalletPayloadId,
    predicate: (group: AccountTreeSnapshotGroup) => boolean,
  ): AccountTreeSnapshot {
    const walletIndex = this.#entries.findIndex(
      (entry) => entry.id === walletId,
    );
    if (walletIndex === -1) {
      throw new Error(
        `Cannot filter groups: wallet "${walletId}" not found in snapshot`,
      );
    }

    const wallet = this.#entries[walletIndex];

    const filteredGroups = wallet.groups.filter((group) =>
      predicate(group as AccountTreeSnapshotGroup),
    );

    const filteredEntries = [...this.#entries];
    if (filteredGroups.length === 0) {
      filteredEntries.splice(walletIndex, 1);
    } else if (wallet.type === 'mnemonic') {
      filteredEntries[walletIndex] = {
        ...wallet,
        groups: filteredGroups as AccountWalletMnemonicGroupEntry[],
      };
    } else {
      filteredEntries[walletIndex] = {
        ...wallet,
        groups: filteredGroups as AccountWalletPrivateKeyGroupEntry[],
      };
    }

    return new AccountTreeSnapshot(filteredEntries, this.#idMap);
  }

  /**
   * Filters groups across every wallet.
   *
   * The parent wallet is provided as context to the predicate. Removes any
   * wallet with no remaining groups after filtering.
   *
   * @param predicate - Function called with each group and its parent wallet.
   * @returns A filtered snapshot.
   */
  filterAllGroups(
    predicate: (
      group: AccountTreeSnapshotGroup,
      wallet: AccountTreeSnapshotWallet,
    ) => boolean,
  ): AccountTreeSnapshot {
    const filteredEntries: AccountTreeWalletEntry[] = [];

    for (const wallet of this.#entries) {
      const filteredGroups = wallet.groups.filter((group) =>
        predicate(
          group as AccountTreeSnapshotGroup,
          wallet as AccountTreeSnapshotWallet,
        ),
      );

      if (filteredGroups.length === 0) {
        continue;
      }

      if (wallet.type === 'mnemonic') {
        filteredEntries.push({
          ...wallet,
          groups: filteredGroups as AccountWalletMnemonicGroupEntry[],
        });
      } else {
        filteredEntries.push({
          ...wallet,
          groups: filteredGroups as AccountWalletPrivateKeyGroupEntry[],
        });
      }
    }

    return new AccountTreeSnapshot(filteredEntries, this.#idMap);
  }

  /**
   * Converts a payload ID (wallet or group) to the corresponding local
   * `AccountTreeController` ID.
   *
   * The map reflects the original export, not the wallets/groups currently
   * retained in this snapshot after filtering.
   *
   * @param payloadId - Stable cross-device wallet or group payload ID.
   * @returns The local controller ID, or `undefined` if not found or no ID map is present.
   */
  toLocalId(
    payloadId: AccountWalletPayloadId | AccountGroupPayloadId,
  ): ReturnType<IdMap['getLocalId']> {
    return this.#idMap?.getLocalId(payloadId);
  }

  /**
   * Converts a local `AccountTreeController` ID (wallet or group) to its
   * stable cross-device payload ID.
   *
   * The map reflects the original export, not the wallets/groups currently
   * retained in this snapshot after filtering.
   *
   * @param localId - Local controller wallet or group ID.
   * @returns The payload ID, or `undefined` if not found or no ID map is present.
   */
  toPayloadId(
    localId: Parameters<IdMap['add']>[0],
  ): ReturnType<IdMap['getPayloadId']> {
    return this.#idMap?.getPayloadId(localId);
  }

  /**
   * Serializes the snapshot to a flat {@link AccountTreePayload} with `version` inlined
   * alongside the wallet entries.
   *
   * Returns the constructor-frozen wallet tree without copying it again.
   *
   * @returns The versioned flat payload.
   */
  serialize(): AccountTreePayload {
    return {
      version: ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION,
      wallets: this.#entries,
    };
  }

  /**
   * Validates a raw value as an {@link AccountTreePayload}, running any
   * necessary version migrations, and returns an immutable snapshot.
   *
   * This is the entry point for untrusted serialized data. Unsupported schema
   * versions and wallet types fail closed with an error instead of returning a
   * partial snapshot.
   *
   * The returned snapshot has no ID map — {@link toLocalId} / {@link toPayloadId}
   * return `undefined`. Pass an {@link IdMap} to the constructor when you need
   * the map.
   *
   * @param raw - Unknown value to parse.
   * @returns A validated snapshot.
   * @throws If `raw` is not a valid payload or its version is unsupported.
   */
  static async deserialize(raw: unknown): Promise<AccountTreeSnapshot> {
    // TODO: Use migration framework here.
    assertValidAccountTreePayload(raw);
    return new AccountTreeSnapshot(raw.wallets);
  }
}
