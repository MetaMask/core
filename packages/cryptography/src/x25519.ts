import { toUint8Array } from './utils.js';

const X25519_KEY_LENGTH = 32;

// https://www.rfc-editor.org/rfc/rfc7748#section-4.1
const X25519_BASE_POINT = new Uint8Array(32);
X25519_BASE_POINT[0] = 9;

// https://www.rfc-editor.org/rfc/rfc8410#section-7
// https://github.com/nodejs/node/blob/main/test/parallel/test-webcrypto-export-import-cfrg.js
const X25519_PKCS8_HEADER = new Uint8Array([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x6e, 0x04,
  0x22, 0x04, 0x20,
]);

/**
 * Perform scalar multiplication of a point by a private key,
 * specified as the X25519 function in RFC 7748, Section 5.
 *
 * @param privateKey - The 32-byte X25519 private key (scalar).
 * @param publicKey - The 32-byte X25519 public key (u-coordinate).
 * @returns The 32-byte result of the scalar multiplication.
 */
async function scalarMultiply(
  privateKey: BufferSource,
  publicKey: BufferSource,
): Promise<Uint8Array> {
  if (privateKey.byteLength !== X25519_KEY_LENGTH) {
    throw new Error(
      `Invalid private key length: Private key must be exactly ${X25519_KEY_LENGTH} bytes for X25519.`,
    );
  }

  if (publicKey.byteLength !== X25519_KEY_LENGTH) {
    throw new Error(
      `Invalid public key length: Public key must be exactly ${X25519_KEY_LENGTH} bytes for X25519.`,
    );
  }

  // The WebCrypto API expects private keys to be in PKCS8 format.
  const pkcs8 = new Uint8Array(X25519_PKCS8_HEADER.length + X25519_KEY_LENGTH);
  pkcs8.set(X25519_PKCS8_HEADER);
  pkcs8.set(toUint8Array(privateKey), X25519_PKCS8_HEADER.length);

  const subtlePrivateKey = await globalThis.crypto.subtle.importKey(
    'pkcs8',
    pkcs8,
    { name: 'X25519' },
    false,
    ['deriveBits'],
  );

  const subtlePublicKey = await globalThis.crypto.subtle.importKey(
    'raw',
    publicKey,
    { name: 'X25519' },
    false,
    [],
  );

  const result = await globalThis.crypto.subtle.deriveBits(
    { name: 'X25519', public: subtlePublicKey },
    subtlePrivateKey,
    X25519_KEY_LENGTH * 8,
  );

  return new Uint8Array(result);
}

/**
 * Derive the X25519 public key corresponding to a private key.
 *
 * @param privateKey - The 32-byte X25519 private key.
 * @returns The 32-byte X25519 public key.
 */
export async function getPublicKey(
  privateKey: BufferSource,
): Promise<Uint8Array> {
  // X25519 public keys are derived as X25519(k, 9)
  return scalarMultiply(privateKey, X25519_BASE_POINT);
}

/**
 * Compute the X25519 shared secret given a private key and a peer's public key.
 *
 * @param privateKey - The 32-byte X25519 private key.
 * @param publicKey - The 32-byte X25519 public key of the peer.
 * @returns The 32-byte shared secret.
 */
export async function getSharedSecret(
  privateKey: BufferSource,
  publicKey: BufferSource,
): Promise<Uint8Array> {
  // X25519 shared secrets are derived as X25519(a, K_b)
  return scalarMultiply(privateKey, publicKey);
}
