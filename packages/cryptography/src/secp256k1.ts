// TODO: Determine how to deal with hashing.
import {
  get_public_key as wasmGetPublicKey,
  sign_prehash as wasmSign,
  verify_prehash as wasmVerify,
} from '../rust/pkg/secp256k1.js';
import { getRandomBytes } from './random.js';
import { KeyPair } from './types.js';
import { toUint8Array } from './utils.js';

const SECP256K1_PRIVATE_KEY_LENGTH = 32;
const SECP256K1_PUBLIC_KEY_LENGTH = 33;
const SECP256K1_SIGNATURE_LENGTH = 64;

/**
 * Generate a new random secp256k1 key pair.
 *
 * @returns The raw 32-byte secp256k1 private key and 32-byte secp256k1 public key.
 */
export async function generateKeyPair(): Promise<KeyPair> {
  const privateKey = getRandomBytes(SECP256K1_PRIVATE_KEY_LENGTH);

  return {
    privateKey,
    publicKey: await getPublicKey(privateKey),
  };
}

/**
 * Derive the secp256k1 public key corresponding to the given private key.
 *
 * @param privateKey - The 32-byte secp256k1 private key.
 * @returns The 32-byte secp256k1 public key.
 */
export async function getPublicKey(
  privateKey: BufferSource,
): Promise<Uint8Array<ArrayBuffer>> {
  if (privateKey.byteLength !== SECP256K1_PRIVATE_KEY_LENGTH) {
    throw new Error(
      `Invalid private key length: Private key must be exactly ${SECP256K1_PRIVATE_KEY_LENGTH} bytes for secp256k1.`,
    );
  }

  return wasmGetPublicKey(toUint8Array(privateKey));
}

/**
 * Sign the given data using the given secp256k1 private key.
 *
 * @param privateKey - The 32-byte secp256k1 private key seed.
 * @param data - The data to sign.
 * @returns The 64-byte secp256k1 signature.
 */
export async function sign(
  privateKey: BufferSource,
  data: BufferSource,
): Promise<Uint8Array<ArrayBuffer>> {
  if (privateKey.byteLength !== SECP256K1_PRIVATE_KEY_LENGTH) {
    throw new Error(
      `Invalid private key length: Private key must be exactly ${SECP256K1_PRIVATE_KEY_LENGTH} bytes for secp256k1.`,
    );
  }

  return wasmSign(toUint8Array(privateKey), toUint8Array(data));
}

/**
 * Verify an secp256k1 signature.
 *
 * @param publicKey - The 32-byte secp256k1 public key.
 * @param signature - The 64-byte signature to verify.
 * @param data - The signed data.
 * @returns `true` if the signature is valid, `false` otherwise.
 */
export async function verify(
  publicKey: BufferSource,
  signature: BufferSource,
  data: BufferSource,
): Promise<boolean> {
  if (publicKey.byteLength !== SECP256K1_PUBLIC_KEY_LENGTH) {
    throw new Error(
      `Invalid public key length: Public key must be exactly ${SECP256K1_PUBLIC_KEY_LENGTH} bytes for secp256k1.`,
    );
  }

  if (signature.byteLength !== SECP256K1_SIGNATURE_LENGTH) {
    throw new Error(
      `Invalid signature length: Signature must be exactly ${SECP256K1_SIGNATURE_LENGTH} bytes for secp256k1.`,
    );
  }

  return wasmVerify(
    toUint8Array(publicKey),
    toUint8Array(signature),
    toUint8Array(data),
  );
}
