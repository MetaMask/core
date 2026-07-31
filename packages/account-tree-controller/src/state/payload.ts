import type { KeyringAccount } from '@metamask/keyring-api';
import {
  assert,
  array,
  boolean,
  define,
  enums,
  integer,
  literal,
  object,
  optional,
  sensitive,
  string,
  StructError,
  union,
} from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';

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

/**
 * Recursively readonly view of `T` used by snapshot filtering predicate types.
 *
 * @typeParam T - The mutable source type to expose as deeply read-only.
 */
export type DeepReadonly<T> = T extends readonly (infer Item)[]
  ? readonly DeepReadonly<Item>[]
  : T extends object
    ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
    : T;

/**
 * Deeply read-only wallet view passed to {@link AccountTreeSnapshot.filterWallets}
 * and {@link AccountTreeSnapshot.filterAllGroups} predicates.
 *
 * Values are runtime-frozen before the predicate runs, so callers cannot mutate
 * wallet IDs, types, secrets, metadata, or groups.
 */
export type AccountTreeSnapshotWallet = DeepReadonly<
  AccountWalletMnemonicPayload | AccountWalletPrivateKeyPayload
>;

/**
 * Deeply read-only group view passed to {@link AccountTreeSnapshot.filterGroups}
 * and {@link AccountTreeSnapshot.filterAllGroups} predicates.
 *
 * Values are runtime-frozen before the predicate runs, so callers cannot mutate
 * group IDs, secrets, metadata, or parent wallet references.
 */
export type AccountTreeSnapshotGroup = DeepReadonly<
  AccountWalletMnemonicGroupEntry | AccountWalletPrivateKeyGroupEntry
>;

/**
 * @deprecated Use {@link AccountTreeSnapshotWallet} instead.
 */
export type AccountTreeSnapshotEntry = AccountTreeSnapshotWallet;

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

const AccountWalletPayloadIdSchema = define<AccountWalletPayloadId>(
  'AccountWalletPayloadId',
  (value) =>
    typeof value === 'string' && value.startsWith('wallet:')
      ? true
      : 'Expected a wallet payload ID starting with "wallet:"',
);

const AccountGroupPayloadIdSchema = define<AccountGroupPayloadId>(
  'AccountGroupPayloadId',
  (value) =>
    typeof value === 'string' && PAYLOAD_GROUP_ID_REGEX.test(value)
      ? true
      : 'Expected a group payload ID in the form "wallet:<id>/<subId>"',
);

const AccountWalletPayloadMetadataSchema = object({
  name: string(),
});

const AccountWalletGroupPayloadMetadataSchema = object({
  name: string(),
  pinned: boolean(),
  hidden: boolean(),
});

const AccountWalletPrivateKeyValueSchema = object({
  privateKey: sensitive(string()),
  encoding: enums(['hexadecimal', 'base58', 'base32']),
  type: optional(string()),
});

const AccountWalletMnemonicGroupEntrySchema = object({
  id: AccountGroupPayloadIdSchema,
  groupIndex: integer(),
  metadata: AccountWalletGroupPayloadMetadataSchema,
});

const AccountWalletPrivateKeyGroupEntrySchema = object({
  id: AccountGroupPayloadIdSchema,
  value: optional(AccountWalletPrivateKeyValueSchema),
  metadata: AccountWalletGroupPayloadMetadataSchema,
});

const AccountWalletMnemonicPayloadSchema = object({
  id: AccountWalletPayloadIdSchema,
  type: literal('mnemonic'),
  value: optional(sensitive(string())),
  metadata: AccountWalletPayloadMetadataSchema,
  groups: array(AccountWalletMnemonicGroupEntrySchema),
});

const AccountWalletPrivateKeyPayloadSchema = object({
  id: AccountWalletPayloadIdSchema,
  type: literal('private-key'),
  metadata: AccountWalletPayloadMetadataSchema,
  groups: array(AccountWalletPrivateKeyGroupEntrySchema),
});

const AccountTreeWalletEntrySchema = union([
  AccountWalletMnemonicPayloadSchema,
  AccountWalletPrivateKeyPayloadSchema,
]);

/**
 * Superstruct schema for a versioned {@link AccountTreePayload}.
 *
 * Validates v1 wallet entries (`'mnemonic'` and `'private-key'` only) and
 * rejects unsupported wallet types. Secret fields (`value`, `privateKey`) use
 * the Superstruct `sensitive()` wrapper so validation failures redact secrets
 * from error output.
 */
export const AccountTreePayloadSchema = object({
  version: literal(ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION),
  wallets: array(AccountTreeWalletEntrySchema),
});

/** Inferred TypeScript type for a value matching {@link AccountTreePayloadSchema}. */
export type AccountTreePayloadSchemaType = Infer<
  typeof AccountTreePayloadSchema
>;

/**
 * Formats Superstruct validation failures into a single error message string.
 *
 * @param error - The StructError thrown during payload validation.
 * @returns A comma-separated list of `[path] message` entries.
 */
const formatValidationErrorMessages = (error: StructError): string =>
  error
    .failures()
    .map(({ path, message }) => `[${path.join('.')}] ${message}`)
    .join(', ');

/**
 * Asserts that `value` conforms to the v1 {@link AccountTreePayload} schema.
 *
 * Prefer {@link AccountTreeSnapshot.deserialize} at transport boundaries so
 * validation stays paired with snapshot construction. Use this helper when you
 * already hold a parsed object and need to assert its shape before further
 * processing.
 *
 * @param value - Value to validate.
 * @throws If `value` is not a valid v1 payload, including unsupported wallet types.
 */
export function assertValidAccountTreePayload(
  value: unknown,
): asserts value is AccountTreePayload {
  try {
    assert(value, AccountTreePayloadSchema);
  } catch (error) {
    if (error instanceof StructError) {
      throw new Error(
        `Invalid AccountTreePayload: ${formatValidationErrorMessages(error)}`,
      );
    }
    /* istanbul ignore next */
    throw error;
  }
}

type Migrator = (raw: unknown) => AccountTreePayload;

/**
 * Validates a raw value as a v1 {@link AccountTreePayload}.
 *
 * @param raw - Unknown value to validate.
 * @returns The validated payload.
 */
const migrateV1 = (raw: unknown): AccountTreePayload => {
  assertValidAccountTreePayload(raw);
  return raw;
};

const MIGRATORS: Record<number, Migrator> = {
  [ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION]: migrateV1,
};

/**
 * Validates a raw value as an `AccountTreePayload` and runs any necessary version migrations.
 *
 * This is the low-level entry point used by {@link AccountTreeSnapshot.deserialize}.
 * Callers receiving untrusted wire data should prefer `deserialize`, which returns
 * an immutable {@link AccountTreeSnapshot} ready for filtering and import.
 *
 * @param raw - Unknown value to validate.
 * @returns A fully migrated `AccountTreePayload`.
 * @throws If `raw` is not a valid payload, its version is unsupported, or any wallet type is unrecognized.
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
  if (version < ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION) {
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

  return result;
}
