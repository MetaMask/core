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

async function hmac(
  key: BufferSource,
  hash: 'SHA-256' | 'SHA-384' | 'SHA-512',
  data: BufferSource,
): Promise<Uint8Array> {
  const subtleKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash },
    false,
    ['sign'],
  );

  const result = await crypto.subtle.sign('HMAC', subtleKey, data);
  return new Uint8Array(result);
}
