import { KeyPair } from './types.js';
import { buildPKCS8Header, toPKCS8 } from './utils.js';

// https://www.rfc-editor.org/rfc/rfc8032
const ED25519_KEY_LENGTH = 32;
const ED25519_SIGNATURE_LENGTH = 64;

// https://www.rfc-editor.org/rfc/rfc8410#section-7
// https://github.com/nodejs/node/blob/main/test/parallel/test-webcrypto-export-import-cfrg.js
const ED25519_PKCS8_HEADER = buildPKCS8Header([0x2b, 0x65, 0x70]);

/**
 * Generate a new random Ed25519 key pair.
 *
 * @returns The raw 32-byte Ed25519 private key and 32-byte Ed25519 public key.
 */
export async function generateKey(): Promise<KeyPair> {
  const keyPair = await globalThis.crypto.subtle.generateKey('Ed25519', true, [
    'sign',
    'verify',
  ]);

  // The WebCrypto API does not support exporting private keys in raw format,
  // so the seed is extracted from the PKCS8 envelope instead.
  const pkcs8PrivateKey = await globalThis.crypto.subtle.exportKey(
    'pkcs8',
    keyPair.privateKey,
  );

  const publicKey = await globalThis.crypto.subtle.exportKey(
    'raw',
    keyPair.publicKey,
  );

  return {
    privateKey: new Uint8Array<ArrayBuffer>(
      pkcs8PrivateKey.slice(ED25519_PKCS8_HEADER.length),
    ),
    publicKey: new Uint8Array<ArrayBuffer>(publicKey),
  };
}

/**
 * Derive the Ed25519 public key corresponding to the given private key.
 *
 * @param privateKey - The 32-byte Ed25519 private key.
 * @returns The 32-byte Ed25519 public key.
 */
export async function getPublicKey(
  privateKey: BufferSource,
): Promise<Uint8Array> {
  if (privateKey.byteLength !== ED25519_KEY_LENGTH) {
    throw new Error(
      `Invalid private key length: Private key must be exactly ${ED25519_KEY_LENGTH} bytes for Ed25519.`,
    );
  }

  // The WebCrypto API expects private keys to be in PKCS8 format.
  const subtlePrivateKey = await globalThis.crypto.subtle.importKey(
    'pkcs8',
    toPKCS8(ED25519_PKCS8_HEADER, privateKey),
    { name: 'Ed25519' },
    true,
    ['sign'],
  );

  const jwk = await globalThis.crypto.subtle.exportKey('jwk', subtlePrivateKey);

  // Intentionally discarding private key from JWK (`d`).
  const subtlePublicKey = await globalThis.crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, crv: jwk.crv, x: jwk.x },
    { name: 'Ed25519' },
    true,
    ['verify'],
  );

  const publicKey = await globalThis.crypto.subtle.exportKey(
    'raw',
    subtlePublicKey,
  );

  return new Uint8Array(publicKey);
}

/**
 * Sign the given data using the given Ed25519 private key.
 *
 * @param privateKey - The 32-byte Ed25519 private key seed.
 * @param data - The data to sign.
 * @returns The 64-byte Ed25519 signature.
 */
export async function sign(
  privateKey: BufferSource,
  data: BufferSource,
): Promise<Uint8Array> {
  if (privateKey.byteLength !== ED25519_KEY_LENGTH) {
    throw new Error(
      `Invalid private key length: Private key must be exactly ${ED25519_KEY_LENGTH} bytes for Ed25519.`,
    );
  }

  // The WebCrypto API expects private keys to be in PKCS8 format.
  const subtleKey = await globalThis.crypto.subtle.importKey(
    'pkcs8',
    toPKCS8(ED25519_PKCS8_HEADER, privateKey),
    { name: 'Ed25519' },
    false,
    ['sign'],
  );

  const signature = await globalThis.crypto.subtle.sign(
    { name: 'Ed25519' },
    subtleKey,
    data,
  );

  return new Uint8Array(signature);
}

/**
 * Verify an Ed25519 signature.
 *
 * @param publicKey - The 32-byte Ed25519 public key.
 * @param signature - The 64-byte signature to verify.
 * @param data - The signed data.
 * @returns `true` if the signature is valid, `false` otherwise.
 */
export async function verify(
  publicKey: BufferSource,
  signature: BufferSource,
  data: BufferSource,
): Promise<boolean> {
  if (publicKey.byteLength !== ED25519_KEY_LENGTH) {
    throw new Error(
      `Invalid public key length: Public key must be exactly ${ED25519_KEY_LENGTH} bytes for Ed25519.`,
    );
  }

  if (signature.byteLength !== ED25519_SIGNATURE_LENGTH) {
    throw new Error(
      `Invalid signature length: Signature must be exactly ${ED25519_SIGNATURE_LENGTH} bytes for Ed25519.`,
    );
  }

  const subtleKey = await globalThis.crypto.subtle.importKey(
    'raw',
    publicKey,
    { name: 'Ed25519' },
    false,
    ['verify'],
  );

  return globalThis.crypto.subtle.verify(
    { name: 'Ed25519' },
    subtleKey,
    signature,
    data,
  );
}
