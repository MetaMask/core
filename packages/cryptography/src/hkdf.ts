import type { HashFunction } from './types.js';
import { toUint8Array } from './utils.js';

const MIN_IKM_LENGTH = 32;

const HASH_LENGTH: Record<HashFunction, number> = {
  'SHA-256': 32,
  'SHA-384': 48,
  'SHA-512': 64,
};

export type HkdfOptions = {
  /**
   * Skip the minimum IKM length check. Using IKM shorter than 32 bytes
   * reduces the entropy of the derived key material.
   */
  unsafeInputKeyingMaterial?: boolean;
};

/**
 * Derive key material using HKDF-SHA-256.
 *
 * @param ikm - The input keying material.
 * @param salt - The salt to use.
 * @param info - Context and application-specific information.
 * @param keyLength - The desired key length in bytes.
 * @param options - Additional configuration options.
 * @returns The derived key material.
 */
export async function hkdfSha256(
  ikm: BufferSource,
  salt: BufferSource,
  info: BufferSource,
  keyLength: number,
  options?: HkdfOptions,
): Promise<Uint8Array<ArrayBuffer>> {
  return hkdf(ikm, 'SHA-256', salt, info, keyLength, options);
}

/**
 * Derive key material using HKDF-SHA-384.
 *
 * @param ikm - The input keying material.
 * @param salt - The salt to use.
 * @param info - Context and application-specific information.
 * @param keyLength - The desired key length in bytes.
 * @param options - Additional configuration options.
 * @returns The derived key material.
 */
export async function hkdfSha384(
  ikm: BufferSource,
  salt: BufferSource,
  info: BufferSource,
  keyLength: number,
  options?: HkdfOptions,
): Promise<Uint8Array<ArrayBuffer>> {
  return hkdf(ikm, 'SHA-384', salt, info, keyLength, options);
}

/**
 * Derive key material using HKDF-SHA-512.
 *
 * @param ikm - The input keying material.
 * @param salt - The salt to use.
 * @param info - Context and application-specific information.
 * @param keyLength - The desired key length in bytes.
 * @param options - Additional configuration options.
 * @returns The derived key material.
 */
export async function hkdfSha512(
  ikm: BufferSource,
  salt: BufferSource,
  info: BufferSource,
  keyLength: number,
  options?: HkdfOptions,
): Promise<Uint8Array<ArrayBuffer>> {
  return hkdf(ikm, 'SHA-512', salt, info, keyLength, options);
}

/**
 * Derive key material using HKDF.
 *
 * @param ikm - The input keying material.
 * @param hash - The hash function to use.
 * @param salt - The salt to use.
 * @param info - Context and application-specific information.
 * @param keyLength - The desired key length in bytes.
 * @param options - Additional configuration options.
 * @returns The derived key material.
 */
async function hkdf(
  ikm: BufferSource,
  hash: HashFunction,
  salt: BufferSource,
  info: BufferSource,
  keyLength: number,
  options: HkdfOptions = {},
): Promise<Uint8Array<ArrayBuffer>> {
  if (ikm.byteLength === 0 && !options.unsafeInputKeyingMaterial) {
    throw new Error(
      `Unsafe input keying material length: IKM must not be zero bytes for HKDF-${hash}. To bypass this check, set the \`unsafeInputKeyingMaterial\` option to \`true\`.`,
    );
  }

  if (!options.unsafeInputKeyingMaterial && ikm.byteLength < MIN_IKM_LENGTH) {
    throw new Error(
      `Unsafe input keying material length: IKM must be at least ${MIN_IKM_LENGTH} bytes for HKDF-${hash}. To bypass this check, set the \`unsafeInputKeyingMaterial\` option to \`true\`.`,
    );
  }

  // Some WebCrypto implementations, such as react-native-quick-crypto, reject
  // an empty HKDF key, so derive it from HMAC as RFC 5869 defines it.
  if (ikm.byteLength === 0) {
    return hkdfFromHmac(ikm, hash, salt, info, keyLength);
  }

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

/**
 * Compute the HMAC of the given data with WebCrypto.
 *
 * @param key - The HMAC key.
 * @param hash - The hash function to use.
 * @param data - The data to authenticate.
 * @returns The HMAC.
 */
async function hmacSign(
  key: BufferSource,
  hash: HashFunction,
  data: BufferSource,
): Promise<Uint8Array<ArrayBuffer>> {
  const subtleKey = await globalThis.crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash },
    false,
    ['sign'],
  );

  return new Uint8Array(
    await globalThis.crypto.subtle.sign('HMAC', subtleKey, data),
  );
}

/**
 * Derive key material using HKDF built from HMAC, following the Extract and
 * Expand steps of RFC 5869.
 *
 * @param ikm - The input keying material.
 * @param hash - The hash function to use.
 * @param salt - The salt to use.
 * @param info - Context and application-specific information.
 * @param keyLength - The desired key length in bytes.
 * @returns The derived key material.
 */
async function hkdfFromHmac(
  ikm: BufferSource,
  hash: HashFunction,
  salt: BufferSource,
  info: BufferSource,
  keyLength: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const hashLength = HASH_LENGTH[hash];
  const blockCount = Math.ceil(keyLength / hashLength);
  if (blockCount > 255) {
    throw new Error(
      `Invalid key length: HKDF-${hash} can derive at most ${255 * hashLength} bytes.`,
    );
  }

  // https://datatracker.ietf.org/doc/html/rfc5869#section-2.2
  const pseudoRandomKey = await hmacSign(
    salt.byteLength === 0 ? new Uint8Array(hashLength) : salt,
    hash,
    ikm,
  );

  // https://datatracker.ietf.org/doc/html/rfc5869#section-2.3
  const infoBytes = toUint8Array(info);
  const output = new Uint8Array(blockCount * hashLength);
  let previous = new Uint8Array(0);
  for (let index = 0; index < blockCount; index++) {
    const input = new Uint8Array(previous.length + infoBytes.length + 1);
    input.set(previous);
    input.set(infoBytes, previous.length);
    input[input.length - 1] = index + 1;
    previous = await hmacSign(pseudoRandomKey, hash, input);
    output.set(previous, index * hashLength);
  }

  return output.slice(0, keyLength);
}
