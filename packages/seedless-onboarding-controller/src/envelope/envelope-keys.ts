import {
  enums,
  is,
  literal,
  nonempty,
  number,
  refine,
  string,
  type,
} from '@metamask/superstruct';
import type {
  EnvelopeKeys,
  KeyPair,
  SEC1EncodedPublicKey,
} from '@metamask/toprf-secure-backup';
import {
  base64ToBytes,
  bigIntToHex,
  bytesToBase64,
  bytesToString,
  hexToBigInt,
  stringToBytes,
} from '@metamask/utils';
import { secp256k1 } from '@noble/curves/secp256k1';

import { SeedlessOnboardingControllerErrorMessage } from '../constants.js';
import { SeedlessOnboardingError } from '../utils/errors.js';

const SYMMETRIC_KEY_BYTE_LENGTH = 32;

/**
 * The vault key set `K_v`. It addresses and encrypts the backend vault and
 * does not change on password change.
 */
export type VaultKeySet = {
  authKeyPair: KeyPair;
  encKey: Uint8Array;
  /** The key of the local wraps, stored in the vault as `toprfPwEncryptionKey`. */
  localWrapKey: Uint8Array;
};

export type EnvelopePath = 'password' | 'recovery-secret';

/**
 * Key envelope payload stored in the Metadata Service (encrypted once by the
 * Metadata Service outer AES-256-GCM layer under `envelopeKeys.wrapKey`).
 */
export type Envelope = {
  v: 1;
  path: EnvelopePath;
  /** Hex encoded secp256k1 private key of `K_v.authKeyPair`. */
  authSk: string;
  /** base64 encoded `K_v.encKey` (32 bytes). */
  encKey: string;
  /** base64 encoded `K_v.localWrapKey` (32 bytes). */
  localWrapKey: string;
};

/** An envelope and the keys of the partition it is written to. */
export type PackedEnvelope = {
  keys: EnvelopeKeys;
  envelope: Envelope;
};

export type ControlRecord = {
  v: 1;
  /** Monotonically increasing. Breaks ties between matching records. */
  seq: number;
  passwordNamespace: {
    verifier: string;
    verifierId: string;
    /** Hex encoded auth private key registered with the password OPRF key. */
    authSk: string;
    keyIndex: number;
  };
  migratedAt: number;
};

const EnvelopeStruct = type({
  v: literal(1),
  path: enums(['password', 'recovery-secret'] as const),
  authSk: string(),
  encKey: string(),
  localWrapKey: string(),
});

/**
 * @returns The error thrown for any malformed envelope or control record.
 */
function createInvalidEnvelopeError(): SeedlessOnboardingError {
  return new SeedlessOnboardingError(
    SeedlessOnboardingControllerErrorMessage.InvalidEnvelope,
  );
}

/**
 * Parse JSON bytes, throwing an invalid envelope error on failure.
 *
 * @param data - The JSON bytes.
 * @returns The parsed value.
 */
function parseJsonBytes(data: Uint8Array): unknown {
  try {
    return JSON.parse(bytesToString(data));
  } catch {
    throw createInvalidEnvelopeError();
  }
}

/**
 * Derive the uncompressed SEC1 public key for a secp256k1 private key.
 *
 * @param sk - The private key.
 * @returns The uncompressed public key.
 */
export function derivePubKey(sk: bigint): Uint8Array {
  return secp256k1.getPublicKey(sk, false);
}

/**
 * Check whether two SEC1 encoded public keys represent the same point.
 *
 * @param a - The first public key.
 * @param b - The second public key.
 * @returns `true` if both keys represent the same point.
 */
export function pubKeysEqual(
  a: SEC1EncodedPublicKey,
  b: SEC1EncodedPublicKey,
): boolean {
  return secp256k1.Point.fromHex(a).equals(secp256k1.Point.fromHex(b));
}

/**
 * Pack a vault key set into an envelope payload. Confidentiality and integrity
 * are provided by the Metadata Service AES-256-GCM layer under the partition's
 * `wrapKey`.
 *
 * @param path - The path the envelope belongs to.
 * @param vaultKeySet - The vault key set to pack.
 * @returns The envelope.
 */
export function packEnvelope(
  path: EnvelopePath,
  vaultKeySet: VaultKeySet,
): Envelope {
  return {
    v: 1,
    path,
    authSk: bigIntToHex(vaultKeySet.authKeyPair.sk),
    encKey: bytesToBase64(vaultKeySet.encKey),
    localWrapKey: bytesToBase64(vaultKeySet.localWrapKey),
  };
}

/**
 * Unpack and validate an envelope: check the path, derive the auth public key
 * from `authSk`, and validate symmetric key byte lengths.
 *
 * @param envelope - The envelope.
 * @param path - The expected path of the envelope.
 * @returns The vault key set.
 * @throws `InvalidEnvelope` if the envelope is malformed or does not match.
 */
export function unpackEnvelope(
  envelope: Envelope,
  path: EnvelopePath,
): VaultKeySet {
  if (envelope.path !== path) {
    throw createInvalidEnvelopeError();
  }
  try {
    const sk = hexToBigInt(envelope.authSk);
    const pk = derivePubKey(sk);
    const encKey = base64ToBytes(envelope.encKey);
    const localWrapKey = base64ToBytes(envelope.localWrapKey);
    if (
      encKey.length !== SYMMETRIC_KEY_BYTE_LENGTH ||
      localWrapKey.length !== SYMMETRIC_KEY_BYTE_LENGTH
    ) {
      throw createInvalidEnvelopeError();
    }
    return {
      authKeyPair: { sk, pk },
      encKey,
      localWrapKey,
    };
  } catch (error) {
    if (error instanceof SeedlessOnboardingError) {
      throw error;
    }
    throw createInvalidEnvelopeError();
  }
}

/**
 * @param envelope - The envelope.
 * @returns The envelope as item data.
 */
export function serializeEnvelope(envelope: Envelope): Uint8Array {
  return stringToBytes(JSON.stringify(envelope));
}

/**
 * @param data - The item data.
 * @returns The envelope.
 * @throws `InvalidEnvelope` if the data is not an envelope.
 */
export function parseEnvelope(data: Uint8Array): Envelope {
  const value = parseJsonBytes(data);
  if (!is(value, EnvelopeStruct)) {
    throw createInvalidEnvelopeError();
  }
  return {
    v: 1,
    path: value.path,
    authSk: value.authSk,
    encKey: value.encKey,
    localWrapKey: value.localWrapKey,
  };
}

/**
 * @param record - The control record.
 * @returns The control record as item data.
 */
export function serializeControlRecord(record: ControlRecord): Uint8Array {
  return stringToBytes(JSON.stringify(record));
}

/**
 * @param value - The value to check.
 * @returns Whether the value is a hex encoded secp256k1 private key.
 */
function isAuthSk(value: string): boolean {
  try {
    derivePubKey(hexToBigInt(value));
    return true;
  } catch {
    return false;
  }
}

const SafeSeqStruct = refine(
  number(),
  'safe integer of at least 1',
  (value) => Number.isSafeInteger(value) && value >= 1,
);

const SafeNonNegativeIntegerStruct = refine(
  number(),
  'safe integer of at least 0',
  (value) => Number.isSafeInteger(value) && value >= 0,
);

const ControlRecordStruct = type({
  v: literal(1),
  seq: SafeSeqStruct,
  passwordNamespace: type({
    verifier: nonempty(string()),
    verifierId: nonempty(string()),
    authSk: refine(string(), 'hex encoded secp256k1 private key', isAuthSk),
    keyIndex: SafeNonNegativeIntegerStruct,
  }),
  migratedAt: SafeNonNegativeIntegerStruct,
});

/**
 * Validate a value as a control record and copy its known fields.
 *
 * @param value - The value to check.
 * @returns The control record without unknown fields, or undefined when the
 * value is not a control record.
 */
export function toControlRecord(value: unknown): ControlRecord | undefined {
  if (!is(value, ControlRecordStruct)) {
    return undefined;
  }
  const { passwordNamespace: ns } = value;
  return {
    v: 1,
    seq: value.seq,
    passwordNamespace: {
      verifier: ns.verifier,
      verifierId: ns.verifierId,
      authSk: ns.authSk,
      keyIndex: ns.keyIndex,
    },
    migratedAt: value.migratedAt,
  };
}

/**
 * @param data - The item data.
 * @returns The control record.
 * @throws `InvalidEnvelope` if the data is not a control record.
 */
export function parseControlRecord(data: Uint8Array): ControlRecord {
  const record = toControlRecord(parseJsonBytes(data));
  if (!record) {
    throw createInvalidEnvelopeError();
  }
  return record;
}

/**
 * Select the control record of the live password OPRF key: the one whose auth
 * key matches the nodes' `pub_key`, highest `seq` first.
 *
 * @param records - The control records of the vault.
 * @param passwordAuthPubKey - The auth public key the nodes return.
 * @returns The matching record, or undefined when none matches.
 */
export function selectControlRecord(
  records: ControlRecord[],
  passwordAuthPubKey: SEC1EncodedPublicKey,
): ControlRecord | undefined {
  return [...records]
    .sort((a, b) => b.seq - a.seq)
    .find((record) =>
      pubKeysEqual(
        derivePubKey(hexToBigInt(record.passwordNamespace.authSk)),
        passwordAuthPubKey,
      ),
    );
}

/**
 * @param records - The control records of the vault.
 * @returns The `seq` of the next control record.
 * @throws `InvalidEnvelope` if the next `seq` is not a safe integer.
 */
export function nextControlSeq(records: ControlRecord[]): number {
  const seq = Math.max(0, ...records.map((record) => record.seq)) + 1;
  if (!Number.isSafeInteger(seq)) {
    throw createInvalidEnvelopeError();
  }
  return seq;
}

/**
 * @param record - The control record.
 * @returns The auth key pair registered with the password OPRF key.
 */
export function getPasswordNamespaceAuthKeyPair(
  record: ControlRecord,
): KeyPair {
  const sk = hexToBigInt(record.passwordNamespace.authSk);
  return { sk, pk: derivePubKey(sk) };
}
