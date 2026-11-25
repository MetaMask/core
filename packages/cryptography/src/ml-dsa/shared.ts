/**
 * The ML-DSA parameter sets defined in FIPS 204.
 * https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.204.pdf
 */
export type MlDsaAlgorithm = 'ML-DSA-44' | 'ML-DSA-65' | 'ML-DSA-87';

// https://www.rfc-editor.org/rfc/rfc9881#section-6
const ML_DSA_SEED_LENGTH = 32;

// https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.204.pdf, Table 2
const ML_DSA_PUBLIC_KEY_LENGTHS: Record<MlDsaAlgorithm, number> = {
  'ML-DSA-44': 1312,
  'ML-DSA-65': 1952,
  'ML-DSA-87': 2592,
};

const ML_DSA_SIGNATURE_LENGTHS: Record<MlDsaAlgorithm, number> = {
  'ML-DSA-44': 2420,
  'ML-DSA-65': 3309,
  'ML-DSA-87': 4627,
};

/**
 * Sign the given data using the private key expanded from the given seed.
 *
 * Uses pure ML-DSA signing with an empty context string. WebCrypto signs in
 * the hedged mode of FIPS 204, so signing the same data twice with the same
 * seed produces different (equally valid) signatures.
 *
 * @param seed - The 32-byte ML-DSA seed.
 * @param data - The data to sign.
 * @param algorithm - The ML-DSA parameter set.
 * @returns The ML-DSA signature (2420, 3309, or 4627 bytes).
 */
export async function sign(
  seed: BufferSource,
  data: BufferSource,
  algorithm: MlDsaAlgorithm,
): Promise<Uint8Array<ArrayBuffer>> {
  if (seed.byteLength !== ML_DSA_SEED_LENGTH) {
    throw new Error(
      `Invalid seed length: Seed must be exactly ${ML_DSA_SEED_LENGTH} bytes for ML-DSA.`,
    );
  }

  const subtleKey = await globalThis.crypto.subtle.importKey(
    'raw-seed',
    seed,
    { name: algorithm },
    false,
    ['sign'],
  );

  const signature = await globalThis.crypto.subtle.sign(
    { name: algorithm },
    subtleKey,
    data,
  );

  return new Uint8Array(signature);
}

/**
 * Verify an ML-DSA signature (pure ML-DSA, empty context string).
 *
 * @param publicKey - The encoded ML-DSA public key.
 * @param signature - The signature to verify.
 * @param data - The signed data.
 * @param algorithm - The ML-DSA parameter set.
 * @returns `true` if the signature is valid, `false` otherwise.
 */
export async function verify(
  publicKey: BufferSource,
  signature: BufferSource,
  data: BufferSource,
  algorithm: MlDsaAlgorithm,
): Promise<boolean> {
  const expectedPublicKeyLength = ML_DSA_PUBLIC_KEY_LENGTHS[algorithm];
  if (publicKey.byteLength !== expectedPublicKeyLength) {
    throw new Error(
      `Invalid public key length: Public key must be exactly ${expectedPublicKeyLength} bytes for ${algorithm}.`,
    );
  }

  const expectedSignatureLength = ML_DSA_SIGNATURE_LENGTHS[algorithm];
  if (signature.byteLength !== expectedSignatureLength) {
    throw new Error(
      `Invalid signature length: Signature must be exactly ${expectedSignatureLength} bytes for ${algorithm}.`,
    );
  }

  const subtleKey = await globalThis.crypto.subtle.importKey(
    'raw-public',
    publicKey,
    { name: algorithm },
    false,
    ['verify'],
  );

  return globalThis.crypto.subtle.verify(
    { name: algorithm },
    subtleKey,
    signature,
    data,
  );
}
