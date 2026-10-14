import { bytesToBase64, base64ToBytes } from '@metamask/utils';

/**
 * Encode a byte array as a base64url string (RFC 4648 §5).
 *
 * @param bytes - The bytes to encode.
 * @returns Base64url-encoded string without padding.
 */
export function bytesToBase64URL(bytes: Uint8Array): string {
  return bytesToBase64(bytes)
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_')
    .replace(/[=]+$/u, '');
}

/**
 * Decode a base64url string (RFC 4648 §5) into bytes.
 *
 * @param value - Base64url-encoded string.
 * @returns Decoded bytes.
 */
export function base64URLToBytes(value: string): Uint8Array {
  const standard = value.replace(/-/gu, '+').replace(/_/gu, '/');
  const padLength = (4 - (standard.length % 4)) % 4;
  return Uint8Array.from(base64ToBytes(standard + '='.repeat(padLength)));
}

/**
 * Encode a byte array as a hexadecimal string.
 *
 * @param bytes - The bytes to encode.
 * @returns Hex-encoded string.
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
