import { KeyringAccountTypeStruct } from '@metamask/keyring-api';
import type { KeyringAccount } from '@metamask/keyring-api';
import {
  array,
  assert,
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

import type { DeepReadonly } from './utils.js';

/** Stable cross-device wallet identifier. Format: `wallet:<entropySourceId>`. */
export type AccountWalletPayloadId = `wallet:${string}`;

/** Stable cross-device group identifier. Format: `wallet:<entropySourceId>/<groupSubId>`. */
export type AccountGroupPayloadId = `${AccountWalletPayloadId}/${string}`;

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

/**
 * Wallet type discriminants used in serialized {@link AccountTreePayload} entries.
 *
 * Use these constants instead of raw string literals so callers get autocomplete
 * and a single source of truth for the discriminant values.
 */
export const AccountWalletPayloadType = {
  Mnemonic: 'mnemonic',
  PrivateKey: 'private-key',
} as const;

export type AccountWalletPayloadType =
  (typeof AccountWalletPayloadType)[keyof typeof AccountWalletPayloadType];

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

/**
 * Encoding formats for exported private key material.
 */
export const AccountWalletPrivateKeyEncoding = {
  Hexadecimal: 'hexadecimal',
  Base58: 'base58',
  Base32: 'base32',
} as const;

export type AccountWalletPrivateKeyEncoding =
  (typeof AccountWalletPrivateKeyEncoding)[keyof typeof AccountWalletPrivateKeyEncoding];

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
    encoding: AccountWalletPrivateKeyEncoding;
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
  type: typeof AccountWalletPayloadType.Mnemonic;
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
  type: typeof AccountWalletPayloadType.PrivateKey;
  metadata: AccountWalletPayloadMetadata;
  groups: AccountWalletPrivateKeyGroupEntry[];
};

/** Union of all wallet entry types that can appear in an {@link AccountTreePayload}. */
export type AccountTreeWalletEntry =
  | AccountWalletMnemonicPayload
  | AccountWalletPrivateKeyPayload;

/** Portable snapshot of the full account tree state (flat versioned format). */
export type AccountTreePayload = {
  version: number;
  wallets: AccountTreeWalletEntry[];
};

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

/**
 * Constructs an {@link AccountGroupPayloadId} from a wallet payload ID and a sub-ID.
 *
 * @param walletId - The wallet payload ID this group belongs to.
 * @param subId - The group-specific sub-ID (e.g. group index for mnemonic wallets, address for private-key wallets).
 * @returns The portable group payload ID.
 */
export function toGroupPayloadId(
  walletId: AccountWalletPayloadId,
  subId: string | number,
): AccountGroupPayloadId {
  return `${walletId}/${subId}`;
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
  encoding: enums(Object.values(AccountWalletPrivateKeyEncoding)),
  type: exactOptional(KeyringAccountTypeStruct),
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
  type: literal(AccountWalletPayloadType.Mnemonic),
  value: exactOptional(sensitive(string())),
  metadata: AccountWalletPayloadMetadataStruct,
  groups: array(AccountWalletMnemonicGroupEntryStruct),
});

const AccountWalletPrivateKeyPayloadStruct = object({
  id: AccountWalletPayloadIdStruct,
  type: literal(AccountWalletPayloadType.PrivateKey),
  metadata: AccountWalletPayloadMetadataStruct,
  groups: array(AccountWalletPrivateKeyGroupEntryStruct),
});

const AccountTreeWalletEntryStruct = union([
  AccountWalletMnemonicPayloadStruct,
  AccountWalletPrivateKeyPayloadStruct,
]);

/**
 * Superstruct schema for a fully versioned {@link AccountTreePayload}.
 *
 * Validates the `version` integer alongside v1 wallet entries (`'mnemonic'` and
 * `'private-key'` only). Secret fields (`value`, `privateKey`) use the Superstruct
 * `sensitive()` wrapper so validation failures redact secrets from error output.
 */
export const AccountTreePayloadStruct = object({
  version: integer(),
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
    .map(({ path, type, refinement }) => {
      // Use type/refinement (static strings) instead of message so no payload
      // values ever appear in the output.
      const location = path.length > 0 ? path.join('.') : '<root>';
      return `[${location}] expected: ${refinement ?? type}`;
    })
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
export function assertAccountTreePayload(
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

/** Current version of the {@link AccountTreePayload} format. */
export const ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION = 1;
