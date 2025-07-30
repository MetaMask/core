import type { KeyPair } from '@metamask/toprf-secure-backup';
import {
  base64ToBytes,
  bigIntToHex,
  bytesToBase64,
  hexToBigInt,
} from '@metamask/utils';
import { bytesToUtf8 } from '@noble/ciphers/utils';

import type { DecodedBaseJWTToken, DecodedNodeAuthToken } from './types';

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
 * Serialize the TOPRF authentication key pair to JSON string.
 *
 * @param authKeyPair - The authentication key pair to serialize.
 * @returns The serialized authentication key pair.
 */
export function serializeAuthKeyPair(authKeyPair: KeyPair): string {
  return JSON.stringify({
    pk: bytesToBase64(authKeyPair.pk),
    sk: bigIntToHex(authKeyPair.sk),
  });
}

/**
 * Deserialize the TOPRF authentication key pair from JSON string.
 *
 * @param authKeyPair - The authentication key pair to deserialize.
 * @returns The deserialized authentication key pair.
 */
export function deserializeAuthKeyPair(authKeyPair: string): KeyPair {
  const { pk, sk } = JSON.parse(authKeyPair);
  return {
    pk: base64ToBytes(pk),
    sk: hexToBigInt(sk),
  };
}
