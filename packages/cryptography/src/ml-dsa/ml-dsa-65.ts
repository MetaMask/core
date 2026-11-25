import * as shared from './shared.js';

const ALGORITHM = 'ML-DSA-65';

/**
 * Sign the given data using the ML-DSA-65 private key expanded from the given
 * seed.
 *
 * @param seed - The 32-byte ML-DSA seed.
 * @param data - The data to sign.
 * @returns The 3309-byte ML-DSA-65 signature.
 */
export async function sign(
  seed: BufferSource,
  data: BufferSource,
): Promise<Uint8Array<ArrayBuffer>> {
  return shared.sign(seed, data, ALGORITHM);
}

/**
 * Verify an ML-DSA-65 signature.
 *
 * @param publicKey - The 1952-byte ML-DSA-65 public key.
 * @param signature - The 3309-byte signature to verify.
 * @param data - The signed data.
 * @returns `true` if the signature is valid, `false` otherwise.
 */
export async function verify(
  publicKey: BufferSource,
  signature: BufferSource,
  data: BufferSource,
): Promise<boolean> {
  return shared.verify(publicKey, signature, data, ALGORITHM);
}
