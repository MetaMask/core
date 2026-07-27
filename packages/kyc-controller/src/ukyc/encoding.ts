import { base64ToBytes, bytesToBase64 } from '@metamask/utils';

/**
 * Encoding helpers shared across the UKYC client-material and
 * storage-authorization modules.
 *
 * These are platform-agnostic: they rely on `@metamask/utils` rather than
 * `Buffer` / `atob`, so they run unchanged on mobile, extension, and web.
 */

/**
 * Encodes bytes as unpadded base64url (RFC 4648 §5). This is the wire shape
 * used for `storage_id`, `signing_public_key`, and Ed25519 signatures in the
 * UKYC storage API.
 *
 * @param bytes - The bytes to encode.
 * @returns The base64url string without `=` padding.
 */
export function toBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes)
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_')
    .replace(/[=]+$/u, '');
}

/**
 * Decodes an unpadded (or padded) base64url string back to bytes. Inverse of
 * {@link toBase64Url}.
 *
 * @param value - The base64url string.
 * @returns The decoded bytes.
 */
export function base64UrlToBytes(value: string): Uint8Array {
  return base64ToBytes(
    value
      .replace(/-/gu, '+')
      .replace(/_/gu, '/')
      .padEnd(value.length + ((4 - (value.length % 4)) % 4), '='),
  );
}
