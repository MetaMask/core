import { getRandomBytes } from '@metamask/cryptography';
import { hkdfSha256 } from '@metamask/cryptography/hkdf';
import { sha256 } from '@metamask/cryptography/sha';
import {
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  concatBytes,
  hexToBytes,
  stringToBytes,
} from '@metamask/utils';
import type { Hex } from '@metamask/utils';
import { chacha20poly1305 } from '@noble/ciphers/chacha';
import { p256 } from '@noble/curves/nist';
import stableStringify from 'json-stable-stringify';

import type { EcPublicJwk } from './types.js';

const WRAP_INFO = new TextEncoder().encode('escrow-wrap-v1');
const CHACHA_KEY_LEN = 32;
const CHACHA_NONCE_LEN = 12;

/**
 * Recursively sorts object keys so hashes are independent of property order.
 *
 * @param value - JSON-compatible value.
 * @returns A canonical JSON string.
 */
export function canonicalize(value: unknown): string {
  return stableStringify(value, {
    replacer: (_key, node) =>
      node instanceof Uint8Array ? bytesToHex(node) : node,
  }) as string;
}

/**
 * SHA-256 of the canonical JSON form of `value`, as a 0x-prefixed hex string.
 *
 * @param value - Value to hash.
 * @returns Hex digest.
 */
export async function hash(value: unknown): Promise<Hex> {
  return bytesToHex(await sha256(stringToBytes(canonicalize(value))));
}

/**
 * @returns A random 0x-prefixed id.
 */
export function randomId(): Hex {
  return bytesToHex(getRandomBytes(16));
}

/**
 * Unix time in seconds. AuthController tokens and PoP challenges use this unit.
 *
 * @returns Seconds since the Unix epoch.
 */
export function unixNow(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Generates an ephemeral ECDSA P-256 proof key pair for key-bound identifier PoP.
 *
 * @returns JWK-encoded public and private keys.
 */
export function generateSigningKey(): {
  publicKey: string;
  privateKey: string;
} {
  const privateKeyBytes = p256.utils.randomSecretKey();
  const publicKeyBytes = p256.getPublicKey(privateKeyBytes, false);
  const publicJwk = {
    kty: 'EC',
    crv: 'P-256',
    x: toBase64Url(publicKeyBytes.slice(1, 33)),
    y: toBase64Url(publicKeyBytes.slice(33, 65)),
  };
  return {
    publicKey: JSON.stringify(publicJwk),
    privateKey: JSON.stringify({
      ...publicJwk,
      d: toBase64Url(privateKeyBytes),
    }),
  };
}

/**
 * Signs a message with the ephemeral proof private key.
 *
 * @param privateKey - JWK JSON private key.
 * @param message - Message string; hashed with SHA-256 before ECDSA.
 * @returns Compact IEEE P1363 hex signature (`r‖s`).
 */
export async function sign(privateKey: string, message: string): Promise<Hex> {
  const jwk = JSON.parse(privateKey) as { d?: string };
  if (typeof jwk.d !== 'string') {
    throw new Error('Invalid P-256 private JWK');
  }
  return bytesToHex(
    p256
      .sign(await sha256(stringToBytes(message)), fromBase64Url(jwk.d))
      .toBytes('compact'),
  );
}

/**
 * Verifies a P-256 signature against a public key.
 *
 * @param publicKey - JWK JSON public key.
 * @param signature - Compact IEEE P1363 hex signature.
 * @param message - Message string; hashed with SHA-256 before ECDSA.
 * @returns Whether the signature is valid.
 */
export async function verifySignature(
  publicKey: string,
  signature: string,
  message: string,
): Promise<boolean> {
  const jwk = JSON.parse(publicKey) as { x?: string; y?: string };
  if (typeof jwk.x !== 'string' || typeof jwk.y !== 'string') {
    return false;
  }
  try {
    return p256.verify(
      hexToBytes(signature),
      await sha256(stringToBytes(message)),
      concatBytes([
        new Uint8Array([0x04]),
        fromBase64Url(jwk.x),
        fromBase64Url(jwk.y),
      ]),
    );
  } catch {
    return false;
  }
}

/**
 * Unsigned mutation-receipt digest. SHA-256 of canonical JSON of the receipt
 * fields excluding `signature`.
 *
 * @param receipt - Receipt fields covered by the signature.
 * @param receipt.escrowId - Escrow that issued the receipt.
 * @param receipt.mutationId - Mutation id.
 * @param receipt.receiptKeyId - SHA-256 of the uncompressed receipt public key.
 * @param receipt.requestHash - Mutation request hash.
 * @param receipt.version - Applied version.
 * @returns Hex digest.
 */
export async function hashMutationReceipt(receipt: {
  escrowId: string;
  mutationId: string;
  receiptKeyId: string;
  requestHash: string;
  version: number;
}): Promise<Hex> {
  return hash({
    escrowId: receipt.escrowId,
    mutationId: receipt.mutationId,
    receiptKeyId: receipt.receiptKeyId,
    requestHash: receipt.requestHash,
    version: receipt.version,
  });
}

/**
 * Decodes hex that may or may not have a `0x` prefix.
 *
 * @param hexString - Hex string.
 * @returns Raw bytes.
 */
export function decodeHex(hexString: string): Uint8Array {
  return hexToBytes(hexString.startsWith('0x') ? hexString : `0x${hexString}`);
}

/**
 * SHA-256 of the uncompressed P-256 wrap public key, as `0x` hex.
 *
 * @param wrapPublicKey - Wrap public JWK JSON.
 * @returns Key id matching cubist `wrapKeyId`.
 */
export async function wrapKeyId(wrapPublicKey: string): Promise<Hex> {
  return bytesToHex(
    await sha256(new Uint8Array(publicKeyBytesFromJwk(wrapPublicKey))),
  );
}

/**
 * Encrypts plaintext to a P-256 public key using escrow-wrap-v1.
 *
 * @param privateKey - Sender P-256 private JWK JSON.
 * @param publicKey - Recipient P-256 public JWK JSON.
 * @param plaintext - Bytes to encrypt.
 * @returns Unprefixed hex of `nonce || ciphertext+tag`.
 */
export async function encryptToPublic(
  privateKey: string,
  publicKey: string,
  plaintext: Uint8Array,
): Promise<string> {
  const key = await deriveTransportKey(privateKey, publicKey);
  const nonce = getRandomBytes(CHACHA_NONCE_LEN);
  const ciphertext = chacha20poly1305(key, nonce).encrypt(plaintext);
  return bytesToHex(concatBytes([nonce, ciphertext])).slice(2);
}

/**
 * Decrypts escrow-wrap-v1 ciphertext produced by {@link encryptToPublic}.
 *
 * @param privateKey - Recipient P-256 private JWK JSON.
 * @param publicKey - Sender P-256 public JWK JSON.
 * @param ciphertextHex - Unprefixed or `0x` hex of `nonce || ciphertext+tag`.
 * @returns Plaintext bytes.
 */
export async function decryptFromPublic(
  privateKey: string,
  publicKey: string,
  ciphertextHex: string,
): Promise<Uint8Array> {
  const key = await deriveTransportKey(privateKey, publicKey);
  const blob = decodeHex(ciphertextHex);
  if (blob.length < CHACHA_NONCE_LEN) {
    throw new Error('Wrapped secret is truncated');
  }
  return chacha20poly1305(key, blob.subarray(0, CHACHA_NONCE_LEN)).decrypt(
    blob.subarray(CHACHA_NONCE_LEN),
  );
}

async function deriveTransportKey(
  privateKey: string,
  publicKey: string,
): Promise<Uint8Array> {
  const privateBytes = privateKeyBytesFromJwk(privateKey);
  const publicBytes = publicKeyBytesFromJwk(publicKey);
  const shared = p256.getSharedSecret(privateBytes, publicBytes);
  // noble returns a compressed point (33 bytes). Cubist uses the 32-byte x-coordinate.
  const ikm = shared.slice(1, 33);
  // An empty salt is equivalent to the previous `undefined` salt: HMAC zero-pads
  // the key to the block size either way, so derived keys are unchanged.
  return hkdfSha256(ikm, new Uint8Array(0), WRAP_INFO, CHACHA_KEY_LEN);
}

function privateKeyBytesFromJwk(privateKey: string): Uint8Array {
  const jwk = JSON.parse(privateKey) as { d?: string };
  if (typeof jwk.d !== 'string') {
    throw new Error('Invalid P-256 private JWK');
  }
  return fromBase64Url(jwk.d);
}

function publicKeyBytesFromJwk(publicKey: string): Uint8Array {
  const jwk = JSON.parse(publicKey) as EcPublicJwk;
  if (
    jwk.kty !== 'EC' ||
    jwk.crv !== 'P-256' ||
    typeof jwk.x !== 'string' ||
    typeof jwk.y !== 'string'
  ) {
    throw new Error('Invalid P-256 public JWK');
  }
  return concatBytes([
    new Uint8Array([0x04]),
    fromBase64Url(jwk.x),
    fromBase64Url(jwk.y),
  ]);
}

/**
 * Encodes bytes as unpadded base64url (JWK coordinate format).
 *
 * @param bytes - Raw coordinate or scalar.
 * @returns Base64url string.
 */
function toBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes)
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_')
    .replace(/[=]+$/u, '');
}

/**
 * Decodes unpadded base64url, as used by JWK coordinates and JWT segments.
 *
 * @param value - Base64url string.
 * @returns Raw bytes.
 */
export function fromBase64Url(value: string): Uint8Array {
  return base64ToBytes(
    value
      .replace(/-/gu, '+')
      .replace(/_/gu, '/')
      .padEnd(value.length + ((4 - (value.length % 4)) % 4), '='),
  );
}
