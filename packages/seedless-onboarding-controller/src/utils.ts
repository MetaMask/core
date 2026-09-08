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
  SeedlessPasswordChangeErrorCode,
  SeedlessPasswordChangePhase,
} from './constants.js';
import type { SecretMetadata } from './SecretMetadata.js';
import type {
  DecodedBaseJWTToken,
  DecodedNodeAuthToken,
  DeserializedVaultData,
  InvalidPrimarySecretDataTypeErrorData,
  SeedlessPasswordChangeLifecycle,
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
 * Create a new password-change lifecycle record at the given phase.
 *
 * @param phase - The initial phase.
 * @returns A new lifecycle record.
 */
export function createPasswordChangeLifecycle(
  phase: SeedlessPasswordChangePhase,
): SeedlessPasswordChangeLifecycle {
  return { phase };
}

/**
 * Apply a phase transition to a lifecycle record, returning a new record.
 *
 * Preserves `lastErrorCode` from the previous record unless a new code is
 * provided or the target phase is `IDLE` (which clears it).
 *
 * @param lifecycle - The current lifecycle record (or `undefined` for `IDLE`).
 * @param phase - The target phase.
 * @param lastErrorCode - Optional error code to set on the new record.
 * @returns A new lifecycle record with the transitioned phase.
 */
export function transitionPasswordChangeLifecycle(
  lifecycle: SeedlessPasswordChangeLifecycle | undefined,
  phase: SeedlessPasswordChangePhase,
  lastErrorCode?: SeedlessPasswordChangeErrorCode,
): SeedlessPasswordChangeLifecycle {
  const preservedErrorCode = resolvePasswordChangeErrorCode(
    lifecycle,
    phase,
    lastErrorCode,
  );
  const next: SeedlessPasswordChangeLifecycle = {
    phase,
    ...(preservedErrorCode === undefined
      ? {}
      : { lastErrorCode: preservedErrorCode }),
  };
  return next;
}

/**
 * Resolve the `lastErrorCode` to attach to a transitioned lifecycle record.
 *
 * A new code wins. Otherwise the previous code is preserved unless the target
 * phase is `IDLE` (which clears it).
 *
 * @param lifecycle - The current lifecycle record (or `undefined` for `IDLE`).
 * @param phase - The target phase.
 * @param lastErrorCode - Optional error code to set on the new record.
 * @returns The error code to attach, or `undefined` to omit it.
 */
function resolvePasswordChangeErrorCode(
  lifecycle: SeedlessPasswordChangeLifecycle | undefined,
  phase: SeedlessPasswordChangePhase,
  lastErrorCode?: SeedlessPasswordChangeErrorCode,
): SeedlessPasswordChangeErrorCode | undefined {
  if (lastErrorCode !== undefined) {
    return lastErrorCode;
  }
  if (
    lifecycle?.lastErrorCode !== undefined &&
    phase !== SeedlessPasswordChangePhase.Idle
  ) {
    return lifecycle.lastErrorCode;
  }
  return undefined;
}

/**
 * Return the phase of a lifecycle record, treating `undefined` as `IDLE`.
 *
 * @param lifecycle - The lifecycle record, or `undefined`.
 * @returns The phase, or `IDLE` if the record is missing.
 */
export function getPasswordChangePhase(
  lifecycle: SeedlessPasswordChangeLifecycle | undefined,
): SeedlessPasswordChangePhase {
  return lifecycle?.phase ?? SeedlessPasswordChangePhase.Idle;
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
  from: SeedlessPasswordChangeLifecycle | undefined,
  to: SeedlessPasswordChangePhase,
): boolean {
  const fromPhase = getPasswordChangePhase(from);
  return LEGAL_PASSWORD_CHANGE_TRANSITIONS[fromPhase].includes(to);
}

/**
 * Classify an error into a non-sensitive password-change error code.
 *
 * This inspects the error's `message` and `name` for known patterns. It must
 * never persist the raw error message — only the closed set of codes.
 *
 * @param error - The error to classify.
 * @returns A non-sensitive error code.
 */
export function classifyPasswordChangeError(
  error: unknown,
): SeedlessPasswordChangeErrorCode {
  let message = '';
  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === 'string') {
    message = error;
  }

  if (message.includes('fetch')) {
    return SeedlessPasswordChangeErrorCode.RemoteStatusUnavailable;
  }
  if (
    message.includes('timeout') ||
    message.includes('Timeout') ||
    message.includes('TIMEOUT')
  ) {
    return SeedlessPasswordChangeErrorCode.RemoteTimeout;
  }
  if (
    message.includes('FailedToChangePassword') ||
    message.includes('changeEncKey')
  ) {
    return SeedlessPasswordChangeErrorCode.RemoteAmbiguous;
  }
  if (message.includes('vault')) {
    return SeedlessPasswordChangeErrorCode.LocalVaultFailure;
  }
  if (message.includes('keyring') || message.includes('Keyring')) {
    return SeedlessPasswordChangeErrorCode.LocalKeyringFailure;
  }
  if (message.includes('persist') || message.includes('storage')) {
    return SeedlessPasswordChangeErrorCode.PersistenceFailure;
  }
  return SeedlessPasswordChangeErrorCode.RemoteAmbiguous;
}
