import { SomeError } from '@metamask/auth-network-utils';
import type {
  EnvelopeKeys,
  KeyPair,
  SEC1EncodedPublicKey,
} from '@metamask/toprf-secure-backup';
import {
  EncAccountDataType,
  TOPRFError,
  TOPRFErrorCode,
} from '@metamask/toprf-secure-backup';
import {
  base64ToBytes,
  bigIntToHex,
  bytesToBase64,
  bytesToString,
  hexToBigInt,
} from '@metamask/utils';

import {
  SeedlessOnboardingControllerErrorMessage,
  SecretType,
} from '../constants.js';
import type {
  Envelope,
  PackedEnvelope,
  VaultKeySet,
} from '../envelope/envelope-keys.js';
import { packEnvelope } from '../envelope/envelope-keys.js';
import type { SecretMetadata } from '../SecretMetadata.js';
import type {
  DecodedBaseJWTToken,
  DecodedNodeAuthToken,
  DeserializedVaultData,
  EnvelopeState,
  InvalidPrimarySecretDataTypeErrorData,
  VaultData,
} from '../types.js';
import { assertIsValidVaultData } from './assertions.js';
import { decodeIdToken } from './token.js';

/**
 * The JSON-RPC error data the TOPRF nodes return when they hold no key for
 * the verifier ID.
 */
const NO_PUB_KEY_NODE_ERROR_MESSAGE = 'Error getting pub key';

/**
 * @param vaultData - The decrypted vault data.
 * @returns The vault's key set, as the envelope vault key set `K_v`.
 */
export function toVaultKeySet(vaultData: DeserializedVaultData): VaultKeySet {
  return {
    authKeyPair: vaultData.toprfAuthKeyPair,
    encKey: vaultData.toprfEncryptionKey,
    localWrapKey: vaultData.toprfPwEncryptionKey,
  };
}

/**
 * Build the persisted envelope state for an envelope-managed vault.
 *
 * @param vaultKeySet - The vault key set `K_v`.
 * @param passwordAuthPubKey - The password OPRF auth public key the local
 * password is synced with.
 * @returns The persisted envelope state.
 */
export function createEnvelopeState(
  vaultKeySet: VaultKeySet,
  passwordAuthPubKey: SEC1EncodedPublicKey,
): EnvelopeState {
  return {
    v: 1,
    vaultAuthPubKey: bytesToBase64(vaultKeySet.authKeyPair.pk),
    passwordAuthPubKey: bytesToBase64(passwordAuthPubKey),
  };
}

/**
 * Pack the vault key set for an envelope partition.
 *
 * @param keys - The envelope keys of the partition.
 * @param path - The path the keys were derived on.
 * @param vaultKeySet - The vault key set.
 * @returns The envelope and its partition keys.
 */
export function packFor(
  keys: EnvelopeKeys,
  path: Envelope['path'],
  vaultKeySet: VaultKeySet,
): PackedEnvelope {
  return {
    keys,
    envelope: packEnvelope(path, vaultKeySet),
  };
}

/**
 * Decode the node auth token from base64 to json object.
 *
 * @param token - The node auth token to decode.
 * @returns The decoded node auth token.
 */
export function decodeNodeAuthToken(token: string): DecodedNodeAuthToken {
  return JSON.parse(
    bytesToString(base64ToBytes(token)),
  ) as DecodedNodeAuthToken;
}

/**
 * Decode JWT token.
 *
 * The payload is decoded with the OAuth idToken helpers in {@link decodeIdToken},
 * which accept base64url (`-` and `_`) and standard base64.
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

  return JSON.parse(decodeIdToken(token)) as DecodedBaseJWTToken;
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
 * Parse and validate decrypted vault data.
 *
 * @param data - The decrypted vault data.
 * @returns The parsed vault data.
 * @throws If the decrypted data is not valid JSON or is not valid vault data.
 */
export function parseVaultData(data: unknown): VaultData {
  if (typeof data !== 'string') {
    throw new Error(SeedlessOnboardingControllerErrorMessage.VaultDataError);
  }

  let parsedVaultData: unknown;
  try {
    parsedVaultData = JSON.parse(data);
  } catch {
    throw new Error(SeedlessOnboardingControllerErrorMessage.VaultDataError);
  }

  assertIsValidVaultData(parsedVaultData);

  return parsedVaultData;
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
  const parsedKeyPair = JSON.parse(value) as {
    sk: string;
    pk: string;
  };
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
 * Pick the latest access token when reconciling state with a decrypted vault.
 *
 * @param tokenBeforeUnlock - The access token from state before unlocking.
 * @param tokenAfterUnlock - The access token from the decrypted vault.
 * @returns The token that should remain active.
 */
export function getLatestAccessToken(
  tokenBeforeUnlock: string | undefined,
  tokenAfterUnlock: string,
): string {
  if (
    !tokenBeforeUnlock ||
    !tokenAfterUnlock ||
    tokenBeforeUnlock === tokenAfterUnlock
  ) {
    return tokenAfterUnlock;
  }

  return compareAndGetLatestToken(tokenBeforeUnlock, tokenAfterUnlock);
}

/**
 * Determine whether a token should be proactively refreshed.
 *
 * When `iat` is provided: returns `true` when less than 10% of the token's
 * lifetime remains (i.e. we are in the last 10% before expiry).
 * When `iat` is omitted: returns `true` when the token is already expired.
 *
 * @param exp - Expiration time in seconds.
 * @param iat - Optional issued-at time in seconds.
 * @param now - Current time in seconds. Defaults to the current time.
 * @returns Whether the token should be refreshed.
 */
export function isTokenNearExpiry(
  exp: number,
  iat?: number,
  now = Date.now() / 1000,
): boolean {
  if (iat === undefined) {
    return now >= exp;
  }
  const lifetime = exp - iat;
  // Guard against malformed tokens where iat >= exp (zero or negative lifetime).
  // Fall back to exact-expiry check so bad tokens are always considered stale.
  if (lifetime <= 0) {
    return now >= exp;
  }
  const remaining = exp - now;
  return remaining <= 0.1 * lifetime;
}

/**
 * Unwrap a `TOPRFError`, including one carried on `SomeError.predicate` (e.g.
 * from `fetchAuthPubKey`, which surfaces `Some` errors directly).
 *
 * @param error - The error to inspect.
 * @returns The underlying `TOPRFError`, or `undefined` if none.
 */
function unwrapToprfError(error: unknown): TOPRFError | undefined {
  const candidate = error instanceof SomeError ? error.predicate : error;
  return candidate instanceof TOPRFError ? candidate : undefined;
}

/**
 * Check whether an error indicates that a TOPRF auth token is invalid or
 * expired.
 *
 * @param error - The error to check.
 * @returns Whether the error is an auth token error.
 */
export function isAuthTokenError(error: unknown): boolean {
  const toprfError = unwrapToprfError(error);
  return (
    toprfError?.code === TOPRFErrorCode.AuthTokenExpired ||
    toprfError?.code === TOPRFErrorCode.InvalidAuthToken
  );
}

/**
 * Check whether an error indicates that the TOPRF key chain limit was reached.
 *
 * @param error - The error to check.
 * @returns Whether the error is a max key chain length error.
 */
export function isMaxKeyChainLengthError(error: unknown): boolean {
  if (error instanceof TOPRFError) {
    return error.code === TOPRFErrorCode.MaxKeyChainLengthExceeded;
  }

  return false;
}

/**
 * Check whether an error indicates that the TOPRF evaluation didn't match the
 * stored key, i.e. the input was wrong for the share.
 *
 * @param error - The error to check.
 * @returns Whether the error is a could not derive encryption key error.
 */
export function isCouldNotDeriveEncryptionKeyError(error: unknown): boolean {
  return (
    error instanceof TOPRFError &&
    error.code === TOPRFErrorCode.CouldNotDeriveEncryptionKey
  );
}

/**
 * Check whether an error indicates that the TOPRF nodes hold no key to derive
 * a threshold auth public key from, i.e. no OPRF key is registered.
 *
 * @param error - The error to check.
 * @returns Whether the error is a could not derive threshold auth public key
 * error.
 */
export function isCouldNotDeriveThresholdAuthPubKeyError(
  error: unknown,
): boolean {
  if (isAuthTokenError(error)) {
    return false;
  }

  if (
    unwrapToprfError(error)?.code ===
    TOPRFErrorCode.CouldNotDeriveThresholdAuthPubKey
  ) {
    return true;
  }

  // Nodes without a key for the verifier ID answer with a JSON-RPC error whose
  // data is `NO_PUB_KEY_NODE_ERROR_MESSAGE`. The `Some` helper wraps those
  // responses in a `SomeError` instead of a `TOPRFError`. Require every node
  // response to report `NO_PUB_KEY_NODE_ERROR_MESSAGE` so a single node error
  // mixed with transient failures is not mistaken for "no key registered".
  return (
    error instanceof SomeError &&
    error.errors.length > 0 &&
    error.errors.every(
      (innerError) => innerError?.message === NO_PUB_KEY_NODE_ERROR_MESSAGE,
    )
  );
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
 * @param secrets - The SecretMetadata items in fetch order.
 * @returns One SecretType or EncAccountDataType per item.
 */
export function getInvalidPrimarySecretDataTypeErrorData(
  secrets: SecretMetadata<string | Uint8Array>[],
): InvalidPrimarySecretDataTypeErrorData {
  return secrets.map((secret) => secret.dataType ?? secret.type);
}
