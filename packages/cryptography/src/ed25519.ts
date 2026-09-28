import { toUint8Array } from './utils.js';

// https://www.rfc-editor.org/rfc/rfc8032
const ED25519_KEY_LENGTH = 32;
const ED25519_SIGNATURE_LENGTH = 64;

// https://www.rfc-editor.org/rfc/rfc8410#section-7
// https://github.com/nodejs/node/blob/main/test/parallel/test-webcrypto-export-import-cfrg.js
const ED25519_PKCS8_HEADER = new Uint8Array([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04,
  0x22, 0x04, 0x20,
]);

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

  const pkcs8 = new Uint8Array(
    ED25519_PKCS8_HEADER.length + ED25519_KEY_LENGTH,
  );
  pkcs8.set(ED25519_PKCS8_HEADER);
  pkcs8.set(toUint8Array(privateKey), ED25519_PKCS8_HEADER.length);

  const subtlePrivateKey = await globalThis.crypto.subtle.importKey(
    'pkcs8',
    pkcs8,
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
  const pkcs8 = new Uint8Array(
    ED25519_PKCS8_HEADER.length + ED25519_KEY_LENGTH,
  );
  pkcs8.set(ED25519_PKCS8_HEADER);
  pkcs8.set(toUint8Array(privateKey), ED25519_PKCS8_HEADER.length);

  const subtleKey = await globalThis.crypto.subtle.importKey(
    'pkcs8',
    pkcs8,
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
