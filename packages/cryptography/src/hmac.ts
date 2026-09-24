/**
 * Compute the HMAC-SHA-256 of the given data using the given key.
 *
 * @param key - The key to use.
 * @param data - The data to hash.
 * @returns The HMAC-SHA-256 of the data.
 */
export async function hmacSha256(
  key: BufferSource,
  data: BufferSource,
): Promise<Uint8Array> {
  return hmac(key, 'SHA-256', data);
}

/**
 * Compute the HMAC-SHA-384 of the given data using the given key.
 *
 * @param key - The key to use.
 * @param data - The data to hash.
 * @returns The HMAC-SHA-384 of the data.
 */
export async function hmacSha384(
  key: BufferSource,
  data: BufferSource,
): Promise<Uint8Array> {
  return hmac(key, 'SHA-384', data);
}

/**
 * Compute the HMAC-SHA-512 of the given data using the given key.
 *
 * @param key - The key to use.
 * @param data - The data to hash.
 * @returns The HMAC-SHA-512 of the data.
 */
export async function hmacSha512(
  key: BufferSource,
  data: BufferSource,
): Promise<Uint8Array> {
  return hmac(key, 'SHA-512', data);
}

/**
 * Compute the HMAC-SHA of the given data using the given key.
 *
 * @param key - The key to use.
 * @param hash - The hash to use.
 * @param data - The data to hash.
 * @returns The HMAC-SHA of the data.
 */
async function hmac(
  key: BufferSource,
  hash: 'SHA-256' | 'SHA-384' | 'SHA-512',
  data: BufferSource,
): Promise<Uint8Array> {
  if (key.byteLength === 0) {
    throw new Error('Key must not be empty');
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
