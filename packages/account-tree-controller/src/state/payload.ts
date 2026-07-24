export type AccountWalletPayloadId = `wallet:${string}`;
export type AccountGroupPayloadId = `wallet:${string}/${string}`;

/**
 * Parsed payload group ID.
 */
export type ParsedPayloadGroupId = {
  walletId: AccountWalletPayloadId;
  subId: string;
};

const PAYLOAD_GROUP_ID_REGEX =
  /^(?<walletId>wallet:[^/]+)\/(?<subId>.+)$/u;

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

export const ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION = 1 as const;

export type AccountWalletPayloadMetadata = { name: string };

export type AccountWalletGroupPayloadMetadata = {
  name: string;
  pinned: boolean;
  hidden: boolean;
};

export type AccountWalletMnemonicGroupEntry = {
  id: AccountGroupPayloadId;
  groupIndex: number;
  metadata: AccountWalletGroupPayloadMetadata;
};

export type AccountWalletPrivateKeyGroupEntry = {
  id: AccountGroupPayloadId;
  /**
   * Private key material. Shape matches `ExportedAccount` from `@metamask/keyring-api/v2`
   * so the importer knows how to decode the key without additional out-of-band information.
   * Absent in metadata-only exports.
   */
  value?: {
    privateKey: string;
    encoding: 'hexadecimal' | 'base58' | 'base32';
  };
  metadata: AccountWalletGroupPayloadMetadata;
};

export type AccountWalletMnemonicPayload = {
  id: AccountWalletPayloadId;
  type: 'mnemonic';
  /** BIP-39 mnemonic phrase. Absent in metadata-only exports. */
  value?: string;
  metadata: AccountWalletPayloadMetadata;
  groups: AccountWalletMnemonicGroupEntry[];
};

export type AccountWalletPrivateKeyPayload = {
  id: AccountWalletPayloadId;
  type: 'private-key';
  metadata: AccountWalletPayloadMetadata;
  groups: AccountWalletPrivateKeyGroupEntry[];
};


export type AccountTreeWalletEntry = AccountWalletMnemonicPayload | AccountWalletPrivateKeyPayload;

export type AccountTreePayload = {
  version: typeof ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION;
  wallets: AccountTreeWalletEntry[];
};

/** Wallet entry type available in {@link AccountTreeSnapshot.filter} predicates. */
export type AccountTreeSnapshotEntry =
  | AccountWalletMnemonicPayload
  | AccountWalletPrivateKeyPayload;

export function toWalletPayloadId(entropySourceId: string): AccountWalletPayloadId {
  return `wallet:${entropySourceId}`;
}

export type ExportStateOptions = {
  /** When `true`, secrets (mnemonic / private keys) are included. Requires the vault to be unlocked. */
  includeSecrets?: boolean;
};

type Migrator = (raw: unknown) => AccountTreePayload;

const MIGRATORS: Record<number, Migrator> = {
  // v1 is the current version — identity migration.
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
    throw new Error('Invalid AccountTreePayload: missing numeric version field');
  }
  if (version > ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION) {
    throw new Error(
      `Unsupported AccountTreePayload version: ${version} (current: ${ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION})`,
    );
  }

  let result: unknown = raw;
  for (let v = version; v <= ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION; v++) {
    const migrator = MIGRATORS[v];
    if (migrator) {
      result = migrator(result);
    }
  }

  return result as AccountTreePayload;
}
