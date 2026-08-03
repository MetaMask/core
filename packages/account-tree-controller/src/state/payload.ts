import type { KeyringAccount } from '@metamask/keyring-api';
import type { MigrationChain } from '@metamask/keyring-sdk';
import { createMigrations } from '@metamask/keyring-sdk';
import {
  assert,
  array,
  boolean,
  define,
  enums,
  integer,
  literal,
  object,
  exactOptional,
  sensitive,
  string,
  StructError,
  union,
} from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';
import type { Json } from '@metamask/utils';

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

/** Portable snapshot of the full account tree state (inner data, without version envelope). */
export type AccountTreePayload = {
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
 * Entries are deep-cloned and deep-frozen when a snapshot is constructed, so
 * callers cannot mutate wallet IDs, types, secrets, metadata, or groups.
 */
export type AccountTreeSnapshotWallet = DeepReadonly<
  AccountWalletMnemonicPayload | AccountWalletPrivateKeyPayload
>;

/**
 * Deeply read-only group view passed to {@link AccountTreeSnapshot.filterGroups}
 * and {@link AccountTreeSnapshot.filterAllGroups} predicates.
 *
 * Entries are deep-cloned and deep-frozen when a snapshot is constructed, so
 * callers cannot mutate group IDs, secrets, metadata, or parent wallet references.
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

const AccountWalletPayloadIdStruct = define<AccountWalletPayloadId>(
  'AccountWalletPayloadId',
  (value) =>
    typeof value === 'string' && value.startsWith('wallet:')
      ? true
      : 'Expected a wallet payload ID starting with "wallet:"',
);

const AccountGroupPayloadIdStruct = define<AccountGroupPayloadId>(
  'AccountGroupPayloadId',
  (value) =>
    typeof value === 'string' && PAYLOAD_GROUP_ID_REGEX.test(value)
      ? true
      : 'Expected a group payload ID in the form "wallet:<id>/<subId>"',
);

const AccountWalletPayloadMetadataStruct = object({
  name: string(),
});

const AccountWalletGroupPayloadMetadataStruct = object({
  name: string(),
  pinned: boolean(),
  hidden: boolean(),
});

const AccountWalletPrivateKeyValueStruct = object({
  privateKey: sensitive(string()),
  encoding: enums(['hexadecimal', 'base58', 'base32']),
  type: exactOptional(string()),
});

const AccountWalletMnemonicGroupEntryStruct = object({
  id: AccountGroupPayloadIdStruct,
  groupIndex: integer(),
  metadata: AccountWalletGroupPayloadMetadataStruct,
});

const AccountWalletPrivateKeyGroupEntryStruct = object({
  id: AccountGroupPayloadIdStruct,
  value: exactOptional(AccountWalletPrivateKeyValueStruct),
  metadata: AccountWalletGroupPayloadMetadataStruct,
});

const AccountWalletMnemonicPayloadStruct = object({
  id: AccountWalletPayloadIdStruct,
  type: literal('mnemonic'),
  value: exactOptional(sensitive(string())),
  metadata: AccountWalletPayloadMetadataStruct,
  groups: array(AccountWalletMnemonicGroupEntryStruct),
});

const AccountWalletPrivateKeyPayloadStruct = object({
  id: AccountWalletPayloadIdStruct,
  type: literal('private-key'),
  metadata: AccountWalletPayloadMetadataStruct,
  groups: array(AccountWalletPrivateKeyGroupEntryStruct),
});

const AccountTreeWalletEntryStruct = union([
  AccountWalletMnemonicPayloadStruct,
  AccountWalletPrivateKeyPayloadStruct,
]);

/**
 * Superstruct schema for an {@link AccountTreePayload} (inner data, without version envelope).
 *
 * Validates v1 wallet entries (`'mnemonic'` and `'private-key'` only) and
 * rejects unsupported wallet types. Secret fields (`value`, `privateKey`) use
 * the Superstruct `sensitive()` wrapper so validation failures redact secrets
 * from error output.
 */
export const AccountTreePayloadStruct = object({
  wallets: array(AccountTreeWalletEntryStruct),
});

/** Inferred TypeScript type for a value matching {@link AccountTreePayloadStruct}. */
export type AccountTreePayloadStructType = Infer<
  typeof AccountTreePayloadStruct
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
    assert(value, AccountTreePayloadStruct);
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

/**
 * Migration chain for {@link AccountTreePayload}.
 *
 * Each `.add()` call appends a step; `migrations.version` equals the number of
 * steps and serves as the canonical current version written by
 * {@link AccountTreeSnapshot.serialize}.
 *
 * **v1** — validates and returns the v1 payload structure `{ wallets: [...] }`.
 */
export const migrations: MigrationChain<AccountTreePayload> =
  createMigrations().add({
    migrate(data: Json): AccountTreePayload {
      assertValidAccountTreePayload(data);
      return data;
    },
  });

/** Current version of the {@link AccountTreePayload} format, derived from the migration chain. */
export const ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION = migrations.version;

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
export async function migrate(raw: unknown): Promise<AccountTreePayload> {
  try {
    const { data } = await migrations.apply(raw as Json);
    return data;
  } catch (error) {
    if (error instanceof StructError) {
      throw new Error(
        `Invalid AccountTreePayload: ${formatValidationErrorMessages(error)}`,
      );
    }
    throw error;
  }
}
