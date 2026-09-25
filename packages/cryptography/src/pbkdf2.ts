// https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
const MIN_ITERATIONS: Record<'SHA-256' | 'SHA-384' | 'SHA-512', number> = {
  'SHA-256': 600_000,
  // SHA-384 is not explicitly listed by OWASP; using the SHA-512 value since
  // both variants use 64-bit words internally.
  'SHA-384': 220_000,
  'SHA-512': 220_000,
};

/**
 * Options for the PBKDF2 functions.
 */
export type Pbkdf2Options = {
  /**
   * If `true`, the iteration count check is skipped. Disabling this check
   * reduces the computational cost of brute-force attacks against the derived
   * key.
   */
  unsafeIterations?: boolean;
};

/**
 * Compute the PBKDF2 of the given password, salt, iterations, and key length.
 * The hash function used is SHA-256.
 *
 * @param password - The password to hash.
 * @param salt - The salt to use.
 * @param iterations - The number of iterations.
 * @param keyLength - The desired key length in bytes.
 * @param options - Additional configuration options.
 * @returns The PBKDF2 of the password.
 */
export async function pbkdf2Sha256(
  password: BufferSource,
  salt: BufferSource,
  iterations: number,
  keyLength: number,
  options?: Pbkdf2Options,
): Promise<Uint8Array> {
  return pbkdf2(password, salt, 'SHA-256', iterations, keyLength, options);
}

/**
 * Compute the PBKDF2 of the given password, salt, iterations, and key length.
 * The hash function used is SHA-384.
 *
 * @param password - The password to hash.
 * @param salt - The salt to use.
 * @param iterations - The number of iterations.
 * @param keyLength - The desired key length in bytes.
 * @param options - Additional configuration options.
 * @returns The PBKDF2 of the password.
 */
export async function pbkdf2Sha384(
  password: BufferSource,
  salt: BufferSource,
  iterations: number,
  keyLength: number,
  options?: Pbkdf2Options,
): Promise<Uint8Array> {
  return pbkdf2(password, salt, 'SHA-384', iterations, keyLength, options);
}

/**
 * Compute the PBKDF2 of the given password, salt, iterations, and key length.
 * The hash function used is SHA-512.
 *
 * @param password - The password to hash.
 * @param salt - The salt to use.
 * @param iterations - The number of iterations.
 * @param keyLength - The desired key length in bytes.
 * @param options - Additional configuration options.
 * @returns The PBKDF2 of the password.
 */
export async function pbkdf2Sha512(
  password: BufferSource,
  salt: BufferSource,
  iterations: number,
  keyLength: number,
  options?: Pbkdf2Options,
): Promise<Uint8Array> {
  return pbkdf2(password, salt, 'SHA-512', iterations, keyLength, options);
}

/**
 * Compute the PBKDF2 of the given password, salt, hash, iterations, and key length.
 *
 * @param password - The password to hash.
 * @param salt - The salt to use.
 * @param hash - The hashing function to use.
 * @param iterations - The number of iterations.
 * @param keyLength - The desired key length in bytes.
 * @param options - Additional options.
 * @returns The PBKDF2 of the password.
 */
async function pbkdf2(
  password: BufferSource,
  salt: BufferSource,
  hash: 'SHA-256' | 'SHA-384' | 'SHA-512',
  iterations: number,
  keyLength: number,
  options?: Pbkdf2Options,
): Promise<Uint8Array> {
  if (!options?.unsafeIterations && iterations < MIN_ITERATIONS[hash]) {
    throw new Error(
      `Iterations must be at least ${MIN_ITERATIONS[hash]} for PBKDF2-${hash}.`,
    );
  }

  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    password,
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );

  const derivedBits = await globalThis.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash,
    },
    key,
    // `keyLength` is the number of bytes, but `deriveBits` expects the
    // number of bits, so we multiply by 8.
    keyLength * 8,
  );

  return new Uint8Array(derivedBits);
}
