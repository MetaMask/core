import type { IdMap } from './id-map.js';
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
import {
  AccountWalletPayloadType,
  assertAccountTreePayload,
  ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION,
} from './payload.js';
import { deepFreeze } from './utils.js';

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
   * Returns the primary (first mnemonic) wallet entry, or `undefined` if none
   * is present in the snapshot.
   *
   * Use this to detect whether the primary SRP is included before passing the
   * snapshot to {@link AccountTreeController.importState}. When `undefined`,
   * the controller will reject the snapshot if mnemonic wallets already exist.
   */
  getPrimaryWallet():
    | (AccountTreeSnapshotWallet & { type: AccountWalletPayloadType.Mnemonic })
    | undefined {
    const entry = this.#entries.find(
      (wallet) => wallet.type === AccountWalletPayloadType.Mnemonic,
    );
    return entry as
      | (AccountTreeSnapshotWallet & {
          type: AccountWalletPayloadType.Mnemonic;
        })
      | undefined;
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
   * **Mnemonic wallets:** group indices must remain contiguous starting at 0
   * after filtering, because the payload schema enforces this invariant.
   * Predicates that produce gaps (e.g. keeping only index 1, or 0 and 2) will
   * cause {@link AccountTreeSnapshot.deserialize} to reject the payload on the
   * receiving end.
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
    } else if (wallet.type === AccountWalletPayloadType.Mnemonic) {
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
   * **Mnemonic wallets:** see {@link filterGroups} for the contiguous-index
   * constraint that applies here as well.
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

      if (wallet.type === AccountWalletPayloadType.Mnemonic) {
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
   * Returns a new snapshot with all secret material removed — mnemonic
   * {@link AccountWalletMnemonicPayload.value | values} and private-key group
   * {@link AccountWalletPrivateKeyGroupEntry.value | values} are omitted.
   * Wallet and group metadata (names, pin, hidden) are preserved.
   *
   * Use this to produce a **metadata-only** view for Phase C of the QR sync
   * provisioning flow, where secrets are already in the vault and only layout
   * information needs to be applied.
   *
   * @returns A secrets-stripped snapshot.
   */
  stripSecrets(): AccountTreeSnapshot {
    const entries = this.#entries.map((wallet): AccountTreeWalletEntry => {
      if (wallet.type === AccountWalletPayloadType.Mnemonic) {
        const { value: _value, ...rest } = wallet;
        return rest as AccountWalletMnemonicPayload;
      }
      return {
        ...wallet,
        groups: wallet.groups.map(
          ({ value: _value, ...group }): AccountWalletPrivateKeyGroupEntry =>
            group as AccountWalletPrivateKeyGroupEntry,
        ),
      } as AccountWalletPrivateKeyPayload;
    });
    return new AccountTreeSnapshot(entries, this.#idMap);
  }

  /**
   * Returns a new snapshot with the primary (first mnemonic) wallet removed.
   *
   * The primary wallet is identified positionally — the first
   * {@link AccountWalletPayloadType.Mnemonic} entry in the wallet list. All
   * remaining wallets (secondary mnemonics, private-key wallets) are preserved.
   *
   * Removing the primary wallet makes the snapshot safe to pass to
   * {@link AccountTreeController.importState} during initial onboarding, where
   * the primary SRP has already been imported manually and only secondary
   * secrets need to be added. The controller detects that no primary wallet is
   * present via {@link getPrimaryWallet} and rejects the import post-onboarding.
   *
   * @returns A new snapshot without the primary wallet.
   */
  stripPrimaryWallet(): AccountTreeSnapshot {
    let primaryRemoved = false;
    const entries = this.#entries.filter((wallet) => {
      if (
        wallet.type === AccountWalletPayloadType.Mnemonic &&
        !primaryRemoved
      ) {
        primaryRemoved = true;
        return false;
      }
      return true;
    });
    return new AccountTreeSnapshot(entries, this.#idMap);
  }

  /**
   * Returns a new snapshot with all metadata reset to defaults — wallet names
   * are cleared and group metadata (`name`, `pinned`, `hidden`) is reset.
   * Secret values are preserved.
   *
   * Use this alongside {@link stripPrimaryWallet} for Phase B of the QR sync
   * provisioning flow, where only secondary secrets need to be imported and
   * metadata will be applied later in Phase C.
   *
   * @returns A metadata-stripped snapshot.
   */
  stripMetadata(): AccountTreeSnapshot {
    const entries = this.#entries.map((wallet): AccountTreeWalletEntry => {
      const { metadata: _walletMetadata, ...walletRest } = wallet;
      return {
        ...walletRest,
        groups: wallet.groups.map((group) => {
          const { metadata: _groupMetadata, ...groupRest } = group;
          return groupRest as typeof group;
        }),
      } as AccountTreeWalletEntry;
    });
    return new AccountTreeSnapshot(entries, this.#idMap);
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
    assertAccountTreePayload(raw);
    return new AccountTreeSnapshot(raw.wallets);
  }
}
