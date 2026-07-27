import type { KeyringAccount } from '@metamask/keyring-api';

/** Stable cross-device wallet identifier. Format: `wallet:<entropySourceId>`. */
export type AccountWalletPayloadId = `wallet:${string}`;

/** Stable cross-device group identifier. Format: `wallet:<entropySourceId>/<groupSubId>`. */
export type AccountGroupPayloadId = `wallet:${string}/${string}`;

/**
 * Parsed representation of an {@link AccountGroupPayloadId}.
 */
export type ParsedPayloadGroupId = {
  /** The wallet portion of the group ID. */
  walletId: AccountWalletPayloadId;
  /** The group-specific sub-ID (e.g. group index for mnemonic wallets, address for private-key wallets). */
  subId: string;
};

const PAYLOAD_GROUP_ID_REGEX = /^(?<walletId>wallet:[^/]+)\/(?<subId>.+)$/u;

/**
 * Parses a payload group ID into its wallet ID and group sub-ID components.
 *
 * @param groupId - The payload group ID to parse.
 * @returns The parsed wallet ID and group sub-ID.
 * @throws If the group ID format is invalid.
 */
export function parsePayloadGroupId(
  groupId: AccountGroupPayloadId,
): ParsedPayloadGroupId {
  const match = PAYLOAD_GROUP_ID_REGEX.exec(groupId);
  if (!match?.groups) {
    throw new Error(`Invalid payload group ID: "${groupId}"`);
  }
  return {
    walletId: match.groups.walletId as AccountWalletPayloadId,
    subId: match.groups.subId,
  };
}

/** Current version of the {@link AccountTreePayload} format. */
export const ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION = 1 as const;

/** Wallet-level metadata carried in every payload wallet entry. */
export type AccountWalletPayloadMetadata = { name: string };

/** Group-level metadata carried in every payload group entry. */
export type AccountWalletGroupPayloadMetadata = {
  name: string;
  pinned: boolean;
  hidden: boolean;
};

/** A single group entry inside an {@link AccountWalletMnemonicPayload}. */
export type AccountWalletMnemonicGroupEntry = {
  /** Stable group payload ID. Format: `<walletPayloadId>/<groupIndex>`. */
  id: AccountGroupPayloadId;
  /** BIP-44 account index this group was derived at. */
  groupIndex: number;
  metadata: AccountWalletGroupPayloadMetadata;
};

/** A single group entry inside an {@link AccountWalletPrivateKeyPayload}. */
export type AccountWalletPrivateKeyGroupEntry = {
  /** Stable group payload ID. Format: `wallet:private-key/<address>`. */
  id: AccountGroupPayloadId;
  /**
   * Private key material. Shape matches `ExportedAccount` from `@metamask/keyring-api/v2`
   * so the importer knows how to decode the key without additional out-of-band information.
   * Absent in metadata-only exports.
   */
  value?: {
    privateKey: string;
    encoding: 'hexadecimal' | 'base58' | 'base32';
    /**
     * Account type from `KeyringAccountType` (e.g. `'eip155:eoa'`, `'bip122:p2wpkh'`).
     * Absent for EVM accounts -- import via `SimpleKeyring`.
     * Present for non-EVM accounts -- routing to the BIP-44 Snap handling this type is not yet implemented.
     */
    type?: KeyringAccount['type'];
  };
  metadata: AccountWalletGroupPayloadMetadata;
};

/** Payload entry for an HD (entropy) wallet and its derived account groups. */
export type AccountWalletMnemonicPayload = {
  id: AccountWalletPayloadId;
  type: 'mnemonic';
  /** BIP-39 mnemonic phrase. Absent in metadata-only exports. */
  value?: string;
  metadata: AccountWalletPayloadMetadata;
  groups: AccountWalletMnemonicGroupEntry[];
};

/**
 * Payload entry for all imported private-key accounts.
 *
 * All local simple-keyring wallets are merged into this single entry;
 * each account is represented as a separate group entry keyed by address.
 */
export type AccountWalletPrivateKeyPayload = {
  id: AccountWalletPayloadId;
  type: 'private-key';
  metadata: AccountWalletPayloadMetadata;
  groups: AccountWalletPrivateKeyGroupEntry[];
};

/** Union of all wallet entry types that can appear in an {@link AccountTreePayload}. */
export type AccountTreeWalletEntry =
  | AccountWalletMnemonicPayload
  | AccountWalletPrivateKeyPayload;

/** Versioned, portable snapshot of the full account tree state. */
export type AccountTreePayload = {
  version: typeof ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION;
  wallets: AccountTreeWalletEntry[];
};

/** Wallet entry type exposed to {@link AccountTreeSnapshot.filter} predicates. */
export type AccountTreeSnapshotEntry =
  | AccountWalletMnemonicPayload
  | AccountWalletPrivateKeyPayload;

/**
 * Constructs an {@link AccountWalletPayloadId} from an entropy source ID.
 *
 * @param entropySourceId - Stable entropy source ID returned by `HdKeyring.toEntropySourceId()`.
 * @returns The portable wallet payload ID.
 */
export function toWalletPayloadId(
  entropySourceId: string,
): AccountWalletPayloadId {
  return `wallet:${entropySourceId}`;
}

/** Options accepted by {@link AccountTreeController.exportState}. */
export type ExportStateOptions = {
  /** When `true`, secrets (mnemonic / private keys) are included. Requires the vault to be unlocked. */
  includeSecrets?: boolean;
};

type Migrator = (raw: unknown) => AccountTreePayload;

const MIGRATORS: Record<number, Migrator> = {
  // v1 is the current version -- identity migration.
  [ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION]: (raw) => raw as AccountTreePayload,
};

/**
 * Validates a raw value as an `AccountTreePayload` and runs any necessary version migrations.
 *
 * @param raw - Unknown value to validate.
 * @returns A fully migrated `AccountTreePayload`.
 * @throws If `raw` is not a valid payload or `version > CURRENT_VERSION`.
 */
export function migrate(raw: unknown): AccountTreePayload {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Invalid AccountTreePayload: expected an object');
  }

  const { version } = raw as Record<string, unknown>;
  if (typeof version !== 'number' || !Number.isInteger(version)) {
    throw new Error(
      'Invalid AccountTreePayload: missing numeric version field',
    );
  }
  if (version > ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION) {
    throw new Error(
      `Unsupported AccountTreePayload version: ${version} (current: ${ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION})`,
    );
  }

  let result: unknown = raw;
  for (let ver = version; ver <= ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION; ver++) {
    const migrator = MIGRATORS[ver];
    if (migrator) {
      result = migrator(result);
    }
  }

  return result as AccountTreePayload;
}
