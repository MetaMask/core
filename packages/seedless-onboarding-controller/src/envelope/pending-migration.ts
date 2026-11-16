import { decrypt, encrypt, IV_LENGTH } from '@metamask/cryptography/aes-gcm';
import type { EnvelopeKeys } from '@metamask/toprf-secure-backup';
import {
  base64ToBytes,
  bigIntToHex,
  bytesToBase64,
  bytesToString,
  concatBytes,
  hexToBigInt,
  stringToBytes,
} from '@metamask/utils';

import { derivePubKey, toControlRecord } from './envelope-keys.js';
import type { ControlRecord, Envelope } from './envelope-keys.js';

const PENDING_MIGRATION_AAD = 'mm-envelope-v1/pending-migration';

/** An envelope and the keys of the partition it is written to. */
export type SealedEnvelope = {
  keys: EnvelopeKeys;
  envelope: Envelope;
};

/**
 * The checkpoint of an envelope migration. It is persisted before each remote
 * write, so a retry resumes from the same phase and writes the same bytes.
 */
export type PendingEnvelopeMigration =
  | {
      v: 1;
      phase: 'RS_TOPRF_REGISTERED';
      /** Random id of the migration attempt. */
      id: string;
      /** Hex encoded Recovery Secret. */
      recoverySecret: string;
      /** base64 auth public key of the Recovery Secret OPRF key. */
      rsAuthPubKey: string;
    }
  | {
      v: 1;
      phase: 'ENVELOPES_SEALED';
      /** Random id of the migration attempt. */
      id: string;
      /** Hex encoded Recovery Secret the `rbek` was sealed for. */
      recoverySecret: string;
      /** base64 auth public key of the Recovery Secret OPRF key. */
      rsAuthPubKey: string;
      /** base64 auth public key of the vault key set `K_v`. */
      vaultAuthPubKey: string;
      recoveryEnvelope: SealedEnvelope;
      control: ControlRecord;
    }
  | {
      v: 1;
      phase: 'ENVELOPES_WRITTEN';
      /** Random id of the migration attempt. */
      id: string;
      /** base64 auth public key of the vault key set `K_v`. */
      vaultAuthPubKey: string;
    };

export type PendingEnvelopeMigrationPhase = PendingEnvelopeMigration['phase'];

type SerializedSealedEnvelope = {
  envAuthSk: string;
  wrapKey: string;
  envelope: Envelope;
};

/**
 * @param value - The value to check.
 * @returns Whether the value is a non-null, non-array object.
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @param sealed - The sealed envelope.
 * @returns The JSON-compatible representation.
 */
function serializeSealedEnvelope(
  sealed: SealedEnvelope,
): SerializedSealedEnvelope {
  return {
    envAuthSk: bigIntToHex(sealed.keys.authKeyPair.sk),
    wrapKey: bytesToBase64(sealed.keys.wrapKey),
    envelope: sealed.envelope,
  };
}

/**
 * @param value - The value to check.
 * @returns Whether the value has the shape of a serialized sealed envelope.
 */
function isSerializedSealedEnvelope(
  value: unknown,
): value is SerializedSealedEnvelope {
  return (
    isObject(value) &&
    typeof value.envAuthSk === 'string' &&
    typeof value.wrapKey === 'string' &&
    isObject(value.envelope)
  );
}

/**
 * @param value - The JSON-compatible representation.
 * @returns The sealed envelope.
 */
function parseSealedEnvelope(value: SerializedSealedEnvelope): SealedEnvelope {
  const sk = hexToBigInt(value.envAuthSk);
  return {
    keys: {
      authKeyPair: { sk, pk: derivePubKey(sk) },
      wrapKey: base64ToBytes(value.wrapKey),
    },
    envelope: value.envelope,
  };
}

/**
 * Validate a decrypted checkpoint body and convert it to a pending migration.
 *
 * @param value - The parsed JSON body.
 * @returns The pending migration, or undefined when the body is not one.
 */
function parsePendingMigration(
  value: unknown,
): PendingEnvelopeMigration | undefined {
  if (!isObject(value) || value.v !== 1 || typeof value.id !== 'string') {
    return undefined;
  }
  const { id } = value;

  switch (value.phase) {
    case 'RS_TOPRF_REGISTERED':
      if (
        typeof value.recoverySecret !== 'string' ||
        typeof value.rsAuthPubKey !== 'string'
      ) {
        return undefined;
      }
      return {
        v: 1,
        phase: 'RS_TOPRF_REGISTERED',
        id,
        recoverySecret: value.recoverySecret,
        rsAuthPubKey: value.rsAuthPubKey,
      };

    case 'ENVELOPES_SEALED': {
      const { recoveryEnvelope } = value;
      const control = toControlRecord(value.control);
      if (
        typeof value.recoverySecret !== 'string' ||
        typeof value.rsAuthPubKey !== 'string' ||
        typeof value.vaultAuthPubKey !== 'string' ||
        !isSerializedSealedEnvelope(recoveryEnvelope) ||
        !control
      ) {
        return undefined;
      }
      return {
        v: 1,
        phase: 'ENVELOPES_SEALED',
        id,
        recoverySecret: value.recoverySecret,
        rsAuthPubKey: value.rsAuthPubKey,
        vaultAuthPubKey: value.vaultAuthPubKey,
        recoveryEnvelope: parseSealedEnvelope(recoveryEnvelope),
        control,
      };
    }

    case 'ENVELOPES_WRITTEN':
      if (typeof value.vaultAuthPubKey !== 'string') {
        return undefined;
      }
      return {
        v: 1,
        phase: 'ENVELOPES_WRITTEN',
        id,
        vaultAuthPubKey: value.vaultAuthPubKey,
      };

    default:
      return undefined;
  }
}

/**
 * Encrypt a pending migration checkpoint for storage in state.
 *
 * @param pending - The checkpoint.
 * @param localWrapKey - The local wrap key of the vault key set.
 * @returns base64(iv || ciphertext).
 */
export async function encryptPendingMigration(
  pending: PendingEnvelopeMigration,
  localWrapKey: Uint8Array,
): Promise<string> {
  const body =
    pending.phase === 'ENVELOPES_SEALED'
      ? {
          ...pending,
          recoveryEnvelope: serializeSealedEnvelope(pending.recoveryEnvelope),
        }
      : pending;
  const { iv, ciphertext } = await encrypt(
    localWrapKey as Uint8Array<ArrayBuffer>,
    stringToBytes(JSON.stringify(body)),
    { additionalData: stringToBytes(PENDING_MIGRATION_AAD) },
  );
  return bytesToBase64(concatBytes([iv, ciphertext]));
}

/**
 * Decrypt a pending migration checkpoint from state.
 *
 * @param encrypted - base64(iv || ciphertext).
 * @param localWrapKey - The local wrap key of the vault key set.
 * @returns The checkpoint, or undefined when it does not decrypt under this
 * key set and label, is not valid JSON, has an unknown version or phase, or is
 * missing a field required by its phase.
 */
export async function decryptPendingMigration(
  encrypted: string,
  localWrapKey: Uint8Array,
): Promise<PendingEnvelopeMigration | undefined> {
  try {
    const bytes = base64ToBytes(encrypted);
    const plaintext = await decrypt(
      localWrapKey as Uint8Array<ArrayBuffer>,
      bytes.slice(0, IV_LENGTH),
      bytes.slice(IV_LENGTH),
      { additionalData: stringToBytes(PENDING_MIGRATION_AAD) },
    );
    return parsePendingMigration(JSON.parse(bytesToString(plaintext)));
  } catch {
    return undefined;
  }
}
