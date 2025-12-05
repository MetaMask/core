import type { KeyPair } from '@metamask/toprf-secure-backup';
import {
  base64ToBytes,
  bigIntToHex,
  bytesToBase64,
  hexToBigInt,
} from '@metamask/utils';
import { bytesToUtf8 } from '@noble/ciphers/utils';

import type {
  DecodedBaseJWTToken,
  DecodedNodeAuthToken,
  DeserializedVaultData,
  VaultData,
} from './types';

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
 * Extract the 60-bit timestamp from a TIMEUUID (version 1 UUID) string.
 *
 * TIMEUUID structure: xxxxxxxx-xxxx-1xxx-xxxx-xxxxxxxxxxxx
 * - time_low (first 8 hex chars): least significant 32 bits of timestamp
 * - time_mid (chars 9-12): middle 16 bits of timestamp
 * - time_hi (chars 14-16, after version nibble): most significant 12 bits of timestamp
 *
 * @param uuid - The TIMEUUID string to extract timestamp from.
 * @returns The 60-bit timestamp as a bigint.
 */
export function getTimestampFromTimeuuid(uuid: string): bigint {
  const parts = uuid.split('-');
  const timeLow = parts[0]; // 32 bits (least significant)
  const timeMid = parts[1]; // 16 bits
  const timeHi = parts[2].slice(1); // 12 bits (remove version nibble '1')
  // Reconstruct timestamp: timeHi | timeMid | timeLow
  return BigInt(`0x${timeHi}${timeMid}${timeLow}`);
}

/**
 * Compare two TIMEUUID strings by their actual timestamps.
 *
 * Note: TIMEUUID strings are NOT lexicographically sortable because the
 * least significant bits of the timestamp appear first in the string.
 *
 * @param a - First TIMEUUID string.
 * @param b - Second TIMEUUID string.
 * @param order - Sort order: 'asc' for oldest first, 'desc' for newest first. Default is 'asc'.
 * @returns Negative if a < b (in ascending order), positive if a > b, zero if equal.
 */
export function compareTimeuuid(
  a: string,
  b: string,
  order: 'asc' | 'desc' = 'asc',
): number {
  const tsA = getTimestampFromTimeuuid(a);
  const tsB = getTimestampFromTimeuuid(b);
  if (tsA < tsB) {
    return order === 'asc' ? -1 : 1;
  }
  if (tsA > tsB) {
    return order === 'asc' ? 1 : -1;
  }
  return 0;
}
