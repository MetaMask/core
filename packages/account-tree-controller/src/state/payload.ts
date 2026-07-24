export type AccountWalletPayloadId = `wallet:${string}`;
export type AccountGroupPayloadId = `wallet:${string}/${string}`;

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
export function validateAndMigrate(raw: unknown): AccountTreePayload {
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
