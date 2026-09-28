/**
 * Compute a SHA-256 digest for a given byte array.
 *
 * @param bytes - A byte array.
 * @returns The SHA-256 hash as a byte array.
 */
export async function sha256(bytes: BufferSource): Promise<Uint8Array> {
  return new Uint8Array(
    await globalThis.crypto.subtle.digest('SHA-256', bytes),
  );
}

/**
 * Compute a SHA-384 digest for a given byte array.
 *
 * @param bytes - A byte array.
 * @returns The SHA-384 hash as a byte array.
 */
export async function sha384(bytes: BufferSource): Promise<Uint8Array> {
  return new Uint8Array(
    await globalThis.crypto.subtle.digest('SHA-384', bytes),
  );
}

/**
 * Compute a SHA-512 digest for a given byte array.
 *
 * @param bytes - A byte array.
 * @returns The SHA-512 hash as a byte array.
 */
export async function sha512(bytes: BufferSource): Promise<Uint8Array> {
  return new Uint8Array(
    await globalThis.crypto.subtle.digest('SHA-512', bytes),
  );
}
