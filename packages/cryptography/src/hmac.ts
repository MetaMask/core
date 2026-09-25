import type { HashFunction } from './types';

// https://datatracker.ietf.org/doc/html/rfc2104#section-3
const MIN_KEY_LENGTH: Record<HashFunction, number> = {
  'SHA-256': 32,
  'SHA-384': 48,
  'SHA-512': 64,
};

export type HmacOptions = {
  /**
   * Skip the minimum key length check. Using a key shorter than the hash
   * output length reduces the effective security strength of HMAC (RFC 2104).
   */
  unsafeKeyLength?: boolean;
};

/**
 * Compute the HMAC-SHA-256 of the given data using the given key.
 *
 * @param key - The key to use.
 * @param data - The data to hash.
 * @param options - Additional configuration options.
 * @returns The HMAC-SHA-256 of the data.
 */
export async function hmacSha256(
  key: BufferSource,
  data: BufferSource,
  options?: HmacOptions,
): Promise<Uint8Array> {
  return hmac(key, 'SHA-256', data, options);
}

/**
 * Compute the HMAC-SHA-384 of the given data using the given key.
 *
 * @param key - The key to use.
 * @param data - The data to hash.
 * @param options - Additional configuration options.
 * @returns The HMAC-SHA-384 of the data.
 */
export async function hmacSha384(
  key: BufferSource,
  data: BufferSource,
  options?: HmacOptions,
): Promise<Uint8Array> {
  return hmac(key, 'SHA-384', data, options);
}

/**
 * Compute the HMAC-SHA-512 of the given data using the given key.
 *
 * @param key - The key to use.
 * @param data - The data to hash.
 * @param options - Additional configuration options.
 * @returns The HMAC-SHA-512 of the data.
 */
export async function hmacSha512(
  key: BufferSource,
  data: BufferSource,
  options?: HmacOptions,
): Promise<Uint8Array> {
  return hmac(key, 'SHA-512', data, options);
}

/**
 * Compute the HMAC-SHA of the given data using the given key.
 *
 * @param key - The key to use.
 * @param hash - The hash to use.
 * @param data - The data to hash.
 * @param options - Additional configuration options..
 * @returns The HMAC-SHA of the data.
 */
async function hmac(
  key: BufferSource,
  hash: HashFunction,
  data: BufferSource,
  options: HmacOptions = {},
): Promise<Uint8Array> {
  if (key.byteLength === 0) {
    throw new Error(
      `Unsafe key length: Key must not be zero bytes for HMAC-${hash}.`,
    );
  }

  if (!options.unsafeKeyLength && key.byteLength < MIN_KEY_LENGTH[hash]) {
    throw new Error(
      `Unsafe key length: Key must be at least ${MIN_KEY_LENGTH[hash]} bytes for HMAC-${hash}. To bypass this check, set the \`unsafeKeyLength\` option to \`true\`.`,
    );
  }

  const subtleKey = await globalThis.crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash },
    false,
    ['sign'],
  );

  const result = await globalThis.crypto.subtle.sign('HMAC', subtleKey, data);
  return new Uint8Array(result);
}
