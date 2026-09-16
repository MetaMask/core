import { sha256 as nobleSha256 } from '@noble/hashes/sha256';
import {
  sha512 as nobleSha512,
  sha384 as nobleSha384,
} from '@noble/hashes/sha512';

/**
 * Check whether a byte array is backed by an `ArrayBuffer` rather than a
 * `SharedArrayBuffer`.
 *
 * `crypto.subtle.digest` takes a `BufferSource`, which excludes views on a
 * `SharedArrayBuffer`: passing one throws `TypeError: 2nd argument is a view
 * on a SharedArrayBuffer`. TypeScript models this correctly, so this guard
 * both satisfies the compiler and keeps the runtime honest. Shared inputs fall
 * through to noble, which handles them and returns an identical digest.
 *
 * @param bytes - A byte array.
 * @returns Whether the array is backed by an `ArrayBuffer`.
 */
function isArrayBufferBacked(
  bytes: Uint8Array,
): bytes is Uint8Array & { buffer: ArrayBuffer } {
  return bytes.buffer instanceof ArrayBuffer;
}

/**
 * Compute a SHA-256 digest for a given byte array.
 *
 * Uses the native crypto implementation and falls back to noble.
 *
 * @param bytes - A byte array.
 * @returns The SHA-256 hash as a byte array.
 */
export async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  // Use crypto.subtle.digest whenever possible as it is faster.
  if (
    'crypto' in globalThis &&
    typeof globalThis.crypto === 'object' &&
    globalThis.crypto.subtle?.digest &&
    isArrayBufferBacked(bytes)
  ) {
    return new Uint8Array(
      await globalThis.crypto.subtle.digest('SHA-256', bytes),
    );
  }
  return nobleSha256(bytes);
}

/**
 * Compute a SHA-512 digest for a given byte array.
 *
 * Uses the native crypto implementation and falls back to noble.
 *
 * @param bytes - A byte array.
 * @returns The SHA-512 hash as a byte array.
 */
export async function sha512(bytes: Uint8Array): Promise<Uint8Array> {
  // Use crypto.subtle.digest whenever possible as it is faster.
  if (
    'crypto' in globalThis &&
    typeof globalThis.crypto === 'object' &&
    globalThis.crypto.subtle?.digest &&
    isArrayBufferBacked(bytes)
  ) {
    return new Uint8Array(
      await globalThis.crypto.subtle.digest('SHA-512', bytes),
    );
  }
  return nobleSha512(bytes);
}

/**
 * Compute a SHA-384 digest for a given byte array.
 *
 * Uses the native crypto implementation and falls back to noble.
 *
 * @param bytes - A byte array.
 * @returns The SHA-384 hash as a byte array.
 */
export async function sha384(bytes: Uint8Array): Promise<Uint8Array> {
  // Use crypto.subtle.digest whenever possible as it is faster.
  if (
    'crypto' in globalThis &&
    typeof globalThis.crypto === 'object' &&
    globalThis.crypto.subtle?.digest &&
    isArrayBufferBacked(bytes)
  ) {
    return new Uint8Array(
      await globalThis.crypto.subtle.digest('SHA-384', bytes),
    );
  }
  return nobleSha384(bytes);
}
