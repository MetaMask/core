import { sha256 as nobleSha256 } from '@noble/hashes/sha256';

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
    // eslint-disable-next-line no-restricted-globals
    globalThis.crypto.subtle?.digest
  ) {
    // eslint-disable-next-line no-restricted-globals
    return new Uint8Array(
      await globalThis.crypto.subtle.digest('SHA-256', bytes),
    );
  }
  return nobleSha256(bytes);
}
