import { IdMap } from './id-map.js';
import type {
  AccountGroupPayloadId,
  AccountTreePayload,
  AccountTreeSnapshotGroup,
  AccountTreeSnapshotWallet,
  AccountTreeWalletEntry,
  AccountWalletMnemonicGroupEntry,
  AccountWalletMnemonicPayload,
  AccountWalletPayloadId,
  AccountWalletPrivateKeyGroupEntry,
  AccountWalletPrivateKeyPayload,
} from './payload.js';
import { ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION, migrate } from './payload.js';

/**
 * Creates an {@link AccountTreeSnapshot}. Package-internal factory used by export
 * and tests; callers outside this package should use
 * {@link AccountTreeController.exportState} or {@link AccountTreeSnapshot.deserialize}.
 *
 * @param entries - Wallet entries in the snapshot.
 * @param idMap - Optional local ↔ payload ID map populated during export.
 * @returns A new snapshot.
 */
export function createAccountTreeSnapshot(
  entries: AccountTreeWalletEntry[],
  idMap: IdMap | null,
): AccountTreeSnapshot {
  return new AccountTreeSnapshot(entries, idMap);
}

/**
 * Deep-clones and deep-freezes wallet entries for immutable snapshot storage.
 *
 * @param entries - Mutable wallet entries to copy and freeze.
 * @returns A deep-frozen copy of `entries`.
 */
function cloneAndFreezeEntries(
  entries: AccountTreeWalletEntry[],
): AccountTreeWalletEntry[] {
  return deepFreeze(structuredClone(entries));
}

/**
 * Recursively freezes a value and its nested properties.
 *
 * @param value - Value to freeze.
 * @returns The frozen value.
 */
function deepFreeze<T>(value: T): T {
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
 * Snapshots can only be constructed by {@link AccountTreeController.exportState},
 * {@link AccountTreeSnapshot.deserialize}, or the package-internal
 * {@link createAccountTreeSnapshot} factory.
 *
 * Wallet and group entries are deep-cloned and deep-frozen once in the
 * constructor. Filtering predicates receive those read-only views directly;
 * each filter method returns a new snapshot that repeats the process for its
 * result.
 *
 * Holds an ID map (local ↔ payload) populated during export so callers can
 * bridge between internal controller IDs and the stable cross-device IDs that
 * appear in the serialized payload. The map covers the original export and is
 * preserved unchanged through filtering until {@link serialize}. It is absent
 * for snapshots produced by {@link AccountTreeSnapshot.deserialize} —
 * {@link toLocalId} / {@link toPayloadId} return `undefined` in that case.
 */
export class AccountTreeSnapshot {
  readonly #entries: AccountTreeWalletEntry[];

  readonly #idMap: IdMap | null;

  private constructor(
    entries: AccountTreeWalletEntry[],
    idMap: IdMap | null,
  ) {
    this.#entries = cloneAndFreezeEntries(entries);
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
   * Serializes the snapshot to a versioned {@link AccountTreePayload}.
   *
   * Returns the constructor-frozen wallet tree without copying it again.
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
   * Validates a raw value as an {@link AccountTreePayload}, running any
   * necessary version migrations, and returns an immutable snapshot.
   *
   * This is the entry point for untrusted serialized data. Unsupported schema
   * versions and wallet types fail closed with an error instead of returning a
   * partial snapshot.
   *
   * The returned snapshot has no ID map — {@link toLocalId} / {@link toPayloadId}
   * return `undefined`. Use {@link AccountTreeController.exportState} when you
   * need the map.
   *
   * @param raw - Unknown value to parse.
   * @returns A validated snapshot.
   * @throws If `raw` is not a valid payload or its version is unsupported.
   */
  static deserialize(raw: unknown): AccountTreeSnapshot {
    const payload = migrate(raw);
    return new AccountTreeSnapshot(payload.wallets, null);
  }
}
