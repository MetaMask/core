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
