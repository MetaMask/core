import type { Encapsulation } from '../types.js';

/**
 * The ML-KEM algorithms, named as in WebCrypto.
 */
export type MlKemAlgorithm = 'ML-KEM-768' | 'ML-KEM-1024';

// FIPS 203, Section 3.3: The seed is `d || z`, from which the full
// decapsulation key is deterministically expanded.
const ML_KEM_SEED_LENGTH = 64;

// https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.203.pdf, Table 3
const ML_KEM_LENGTHS: Record<
  MlKemAlgorithm,
  { publicKeyLength: number; ciphertextLength: number }
> = {
  'ML-KEM-768': { publicKeyLength: 1184, ciphertextLength: 1088 },
  'ML-KEM-1024': { publicKeyLength: 1568, ciphertextLength: 1568 },
};

/**
 * Generate a shared secret and a ciphertext that encapsulates it for the
 * holder of the seed matching the given public key.
 *
 * @param algorithm - The ML-KEM algorithm.
 * @param publicKey - The ML-KEM encapsulation key of the recipient.
 * @returns The ciphertext and the 32-byte shared secret.
 */
export async function encapsulate(
  algorithm: MlKemAlgorithm,
  publicKey: BufferSource,
): Promise<Encapsulation> {
  const { publicKeyLength } = ML_KEM_LENGTHS[algorithm];

  if (publicKey.byteLength !== publicKeyLength) {
    throw new Error(
      `Invalid public key length: Public key must be exactly ${publicKeyLength} bytes for ${algorithm}.`,
    );
  }

  const subtlePublicKey = await globalThis.crypto.subtle.importKey(
    'raw-public',
    publicKey,
    { name: algorithm },
    false,
    ['encapsulateBits'],
  );

  const { ciphertext, sharedKey } =
    await globalThis.crypto.subtle.encapsulateBits(
      { name: algorithm },
      subtlePublicKey,
    );

  return {
    ciphertext: new Uint8Array(ciphertext),
    sharedSecret: new Uint8Array(sharedKey),
  };
}

/**
 * Recover the shared secret from a ciphertext using the seed.
 *
 * Per FIPS 203, a ciphertext of the correct length that was not produced for
 * this key does not cause an error. Instead, a pseudorandom shared secret is
 * returned ("implicit rejection"), so a mismatch only surfaces when the two
 * parties' secrets differ.
 *
 * @param algorithm - The ML-KEM algorithm.
 * @param seed - The 64-byte ML-KEM seed (`d || z`).
 * @param ciphertext - The ciphertext produced by `encapsulate`.
 * @returns The 32-byte shared secret.
 */
export async function decapsulate(
  algorithm: MlKemAlgorithm,
  seed: BufferSource,
  ciphertext: BufferSource,
): Promise<Uint8Array<ArrayBuffer>> {
  const { ciphertextLength } = ML_KEM_LENGTHS[algorithm];

  if (seed.byteLength !== ML_KEM_SEED_LENGTH) {
    throw new Error(
      `Invalid seed length: Seed must be exactly ${ML_KEM_SEED_LENGTH} bytes for ${algorithm}.`,
    );
  }

  if (ciphertext.byteLength !== ciphertextLength) {
    throw new Error(
      `Invalid ciphertext length: Ciphertext must be exactly ${ciphertextLength} bytes for ${algorithm}.`,
    );
  }

  const subtleKey = await globalThis.crypto.subtle.importKey(
    'raw-seed',
    seed,
    { name: algorithm },
    false,
    ['decapsulateBits'],
  );

  const sharedSecret = await globalThis.crypto.subtle.decapsulateBits(
    { name: algorithm },
    subtleKey,
    ciphertext,
  );

  return new Uint8Array(sharedSecret);
}
