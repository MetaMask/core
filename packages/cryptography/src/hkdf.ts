import type { HashFunction } from './types.js';

/**
 * Derive key material using HKDF-SHA-256.
 *
 * @param ikm - The input keying material.
 * @param salt - The salt to use.
 * @param info - Context and application-specific information.
 * @param keyLength - The desired key length in bytes.
 * @returns The derived key material.
 */
export async function hkdfSha256(
  ikm: BufferSource,
  salt: BufferSource,
  info: BufferSource,
  keyLength: number,
): Promise<Uint8Array> {
  return hkdf(ikm, 'SHA-256', salt, info, keyLength);
}

/**
 * Derive key material using HKDF-SHA-384.
 *
 * @param ikm - The input keying material.
 * @param salt - The salt to use.
 * @param info - Context and application-specific information.
 * @param keyLength - The desired key length in bytes.
 * @returns The derived key material.
 */
export async function hkdfSha384(
  ikm: BufferSource,
  salt: BufferSource,
  info: BufferSource,
  keyLength: number,
): Promise<Uint8Array> {
  return hkdf(ikm, 'SHA-384', salt, info, keyLength);
}

/**
 * Derive key material using HKDF-SHA-512.
 *
 * @param ikm - The input keying material.
 * @param salt - The to use.
 * @param info - Context and application-specific information.
 * @param keyLength - The desired key length in bytes.
 * @returns The derived key material.
 */
export async function hkdfSha512(
  ikm: BufferSource,
  salt: BufferSource,
  info: BufferSource,
  keyLength: number,
): Promise<Uint8Array> {
  return hkdf(ikm, 'SHA-512', salt, info, keyLength);
}

/**
 * Derive key material using HKDF.
 *
 * @param ikm - The input keying material.
 * @param hash - The hash function to use.
 * @param salt - The salt to use.
 * @param info - Context and application-specific information.
 * @param keyLength - The desired key length in bytes.
 * @returns The derived key material.
 */
async function hkdf(
  ikm: BufferSource,
  hash: HashFunction,
  salt: BufferSource,
  info: BufferSource,
  keyLength: number,
): Promise<Uint8Array> {
  const subtleKey = await globalThis.crypto.subtle.importKey(
    'raw',
    ikm,
    { name: 'HKDF' },
    false,
    ['deriveBits'],
  );

  const derivedBits = await globalThis.crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash,
      salt,
      info,
    },
    subtleKey,
    keyLength * 8,
  );

  return new Uint8Array(derivedBits);
}
