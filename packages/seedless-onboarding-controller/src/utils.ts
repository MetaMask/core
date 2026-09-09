import type { KeyPair } from '@metamask/toprf-secure-backup';
import { EncAccountDataType } from '@metamask/toprf-secure-backup';
import {
  base64ToBytes,
  bigIntToHex,
  bytesToBase64,
  hexToBigInt,
} from '@metamask/utils';
import { bytesToUtf8 } from '@noble/ciphers/utils';

import {
  SecretType,
  SeedlessPasswordChangePhase,
} from './constants.js';
import type { SecretMetadata } from './SecretMetadata.js';
import type {
  DecodedBaseJWTToken,
  DecodedNodeAuthToken,
  DeserializedVaultData,
  InvalidPrimarySecretDataTypeErrorData,
  VaultData,
} from './types.js';

/**
 * Decode the node auth token from base64 to json object.
 *
 * @param token - The node auth token to decode.
 * @returns The decoded node auth token.
 */
export function decodeNodeAuthToken(token: string): DecodedNodeAuthToken {
  return JSON.parse(bytesToUtf8(base64ToBytes(token)));
}

/**
 * Decode JWT token
 *
 * @param token - The JWT token to decode.
 * @returns The decoded JWT token.
 */
export function decodeJWTToken(token: string): DecodedBaseJWTToken {
  // JWT tokens have 3 parts separated by dots: header.payload.signature
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT token format');
  }

  // Decode the payload (second part)
  const payload = parts[1];
  // Add padding if needed for base64 decoding
  const paddedPayload = payload + '='.repeat((4 - (payload.length % 4)) % 4);
  const decoded = JSON.parse(bytesToUtf8(base64ToBytes(paddedPayload)));
  return decoded as DecodedBaseJWTToken;
}

/**
 * Serialize the vault data.
 *
 * @param data - The vault data to serialize.
 * @returns The serialized vault data.
 */
export function serializeVaultData(data: DeserializedVaultData): string {
  const toprfEncryptionKey = bytesToBase64(data.toprfEncryptionKey);
  const toprfPwEncryptionKey = bytesToBase64(data.toprfPwEncryptionKey);
  const toprfAuthKeyPair = serializeToprfAuthKeyPair(data.toprfAuthKeyPair);

  return JSON.stringify({
    toprfEncryptionKey,
    toprfPwEncryptionKey,
    toprfAuthKeyPair,
    revokeToken: data.revokeToken,
    accessToken: data.accessToken,
  });
}

/**
 * Deserialize the vault data.
 *
 * @param value - The stringified vault data.
 * @returns The deserialized vault data.
 */
export function deserializeVaultData(value: VaultData): DeserializedVaultData {
  const toprfEncryptionKey = base64ToBytes(value.toprfEncryptionKey);
  const toprfPwEncryptionKey = base64ToBytes(value.toprfPwEncryptionKey);
  const toprfAuthKeyPair = deserializeAuthKeyPair(value.toprfAuthKeyPair);

  return {
    ...value,
    toprfEncryptionKey,
    toprfPwEncryptionKey,
    toprfAuthKeyPair,
  };
}

/**
 * Serialize TOPRF authentication key pair.
 *
 * @param keyPair - The authentication key pair to serialize.
 * @returns The serialized authentication key pair.
 */
export function serializeToprfAuthKeyPair(keyPair: KeyPair): string {
  const b64EncodedAuthKeyPair = JSON.stringify({
    sk: bigIntToHex(keyPair.sk), // Convert BigInt to hex string
    pk: bytesToBase64(keyPair.pk),
  });

  return b64EncodedAuthKeyPair;
}

/**
 * Deserialize the authentication key pair.
 *
 * @param value - The stringified authentication key pair.
 * @returns The deserialized authentication key pair.
 */
export function deserializeAuthKeyPair(value: string): KeyPair {
  const parsedKeyPair = JSON.parse(value);
  return {
    sk: hexToBigInt(parsedKeyPair.sk),
    pk: base64ToBytes(parsedKeyPair.pk),
  };
}

/**
 * Compare two JWT tokens and return the latest token.
 *
 * @param jwtToken1 - The first JWT token to compare.
 * @param jwtToken2 - The second JWT token to compare.
 * @returns The latest JWT token.
 */
export function compareAndGetLatestToken(
  jwtToken1: string,
  jwtToken2: string,
): string {
  let decodedToken1: DecodedBaseJWTToken;
  let decodedToken2: DecodedBaseJWTToken;

  try {
    decodedToken1 = decodeJWTToken(jwtToken1);
  } catch {
    // if the first token is invalid, return the second token
    return jwtToken2;
  }

  try {
    decodedToken2 = decodeJWTToken(jwtToken2);
  } catch {
    // if the second token is invalid, return the first token
    return jwtToken1;
  }

  if (decodedToken1.exp > decodedToken2.exp) {
    return jwtToken1;
  }
  return jwtToken2;
}

/**
 * Derive SecretType from EncAccountDataType.
 *
 * This function maps the server-side data type classification to the
 * client-side secret type. This allows us to maintain a single source
 * of truth (EncAccountDataType) while still writing the SecretType to
 * the encrypted payload for backward compatibility with older clients.
 *
 * @param dataType - The EncAccountDataType to derive SecretType from.
 * @returns The corresponding SecretType.
 */
export function getSecretTypeFromDataType(
  dataType: EncAccountDataType,
): SecretType {
  switch (dataType) {
    case EncAccountDataType.PrimarySrp:
    case EncAccountDataType.ImportedSrp:
      return SecretType.Mnemonic;
    case EncAccountDataType.ImportedPrivateKey:
      return SecretType.PrivateKey;
    default:
      throw new Error(`Unknown EncAccountDataType: ${String(dataType)}`);
  }
}

/**
 * Build non-sensitive type labels for secret metadata items.
 *
 * @param secrets - The secret metadata items in fetch order.
 * @returns One `SecretType` or `EncAccountDataType` per item.
 */
export function getInvalidPrimarySecretDataTypeErrorData(
  secrets: SecretMetadata<string | Uint8Array>[],
): InvalidPrimarySecretDataTypeErrorData {
  return secrets.map((secret) => secret.dataType ?? secret.type);
}

/**
 * Legal forward transitions for the password-change lifecycle.
 *
 * This map is used by tests to validate that transitions are sensible. It is
 * NOT the source of truth for recovery — a persisted phase may be stale, and
 * recovery must always verify actual remote and local state before acting.
 *
 * `UNKNOWN` is intentionally permissive: recovery may resolve it to any phase
 * or clear it to `IDLE`. Any phase may transition to `UNKNOWN` when a result
 * is ambiguous.
 */
const LEGAL_PASSWORD_CHANGE_TRANSITIONS: Record<
  SeedlessPasswordChangePhase,
  SeedlessPasswordChangePhase[]
> = {
  [SeedlessPasswordChangePhase.Idle]: [
    SeedlessPasswordChangePhase.SeedlessChangePending,
  ],
  [SeedlessPasswordChangePhase.SeedlessChangePending]: [
    SeedlessPasswordChangePhase.SeedlessCommitted,
    SeedlessPasswordChangePhase.Idle,
    SeedlessPasswordChangePhase.Unknown,
  ],
  [SeedlessPasswordChangePhase.SeedlessCommitted]: [
    SeedlessPasswordChangePhase.LocalKeyringPending,
    SeedlessPasswordChangePhase.Unknown,
  ],
  [SeedlessPasswordChangePhase.LocalKeyringPending]: [
    SeedlessPasswordChangePhase.KeySyncPending,
    SeedlessPasswordChangePhase.Unknown,
  ],
  [SeedlessPasswordChangePhase.KeySyncPending]: [
    SeedlessPasswordChangePhase.Complete,
    SeedlessPasswordChangePhase.Unknown,
  ],
  [SeedlessPasswordChangePhase.Complete]: [
    SeedlessPasswordChangePhase.Idle,
  ],
  [SeedlessPasswordChangePhase.Unknown]: [
    SeedlessPasswordChangePhase.Idle,
    SeedlessPasswordChangePhase.SeedlessCommitted,
    SeedlessPasswordChangePhase.LocalKeyringPending,
    SeedlessPasswordChangePhase.KeySyncPending,
    SeedlessPasswordChangePhase.Complete,
  ],
};

/**
 * Resolve a password-change phase, treating `undefined` as `IDLE`.
 *
 * @param phase - The persisted phase, or `undefined`.
 * @returns The phase, or `IDLE` if it is missing.
 */
export function getPasswordChangePhase(
  phase: SeedlessPasswordChangePhase | undefined,
): SeedlessPasswordChangePhase {
  return phase ?? SeedlessPasswordChangePhase.Idle;
}

/**
 * Check whether a phase transition is legal according to the transition map.
 *
 * This is for test validation only. A persisted phase may be stale; recovery
 * must verify actual state rather than relying on this validator.
 *
 * @param from - The source phase (or `undefined` for `IDLE`).
 * @param to - The target phase.
 * @returns `true` if the transition is legal.
 */
export function isValidPasswordChangePhaseTransition(
  from: SeedlessPasswordChangePhase | undefined,
  to: SeedlessPasswordChangePhase,
): boolean {
  const fromPhase = getPasswordChangePhase(from);
  return LEGAL_PASSWORD_CHANGE_TRANSITIONS[fromPhase].includes(to);
}
