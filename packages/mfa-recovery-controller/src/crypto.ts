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
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 as sha256Sync } from '@noble/hashes/sha2';

import type { EcPublicJwk, Identifier } from './types.js';

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
  return JSON.stringify(sortKeys(value));
}

/**
 * SHA-256 of the canonical JSON form of `value`, as a 0x-prefixed hex string.
 *
 * @param value - Value to hash.
 * @returns Hex digest.
 */
export function hash(value: unknown): Hex {
  return bytesToHex(sha256Sync(stringToBytes(canonicalize(value))));
}

/**
 * Canonical identifier list bound into AuthController `identifiersHash`.
 *
 * @param identifiers - Identifier set.
 * @returns Sorted identifier records including verifier material.
 */
export function canonicalizeIdentifiers(identifiers: Identifier[]): unknown {
  return [...identifiers]
    .map((identifier) => ({
      namespace: identifier.namespace,
      type: identifier.type,
      value: identifier.value,
      verifier: identifier.verifier,
    }))
    .sort((left, right) =>
      canonicalize(left).localeCompare(canonicalize(right)),
    );
}

/**
 * @returns A random 0x-prefixed id.
 */
export function randomId(): Hex {
  return bytesToHex(randomBytes(16));
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
export function sign(privateKey: string, message: string): Hex {
  const jwk = JSON.parse(privateKey) as { d?: string };
  if (typeof jwk.d !== 'string') {
    throw new Error('Invalid P-256 private JWK');
  }
  return bytesToHex(
    p256
      .sign(sha256Sync(stringToBytes(message)), fromBase64Url(jwk.d))
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
export function verifySignature(
  publicKey: string,
  signature: string,
  message: string,
): boolean {
  const jwk = JSON.parse(publicKey) as { x?: string; y?: string };
  if (typeof jwk.x !== 'string' || typeof jwk.y !== 'string') {
    return false;
  }
  try {
    return p256.verify(
      hexToBytes(signature as Hex),
      sha256Sync(stringToBytes(message)),
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
export function hashMutationReceipt(receipt: {
  escrowId: string;
  mutationId: string;
  receiptKeyId: string;
  requestHash: string;
  version: number;
}): Hex {
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
  return hexToBytes(
    (hexString.startsWith('0x') ? hexString : `0x${hexString}`) as Hex,
  );
}

/**
 * SHA-256 of the uncompressed P-256 wrap public key, as `0x` hex.
 *
 * @param wrapPublicKey - Wrap public JWK JSON.
 * @returns Key id matching cubist `wrapKeyId`.
 */
export function wrapKeyId(wrapPublicKey: string): Hex {
  return bytesToHex(sha256Sync(publicKeyBytesFromJwk(wrapPublicKey)));
}

/**
 * Encrypts plaintext to a P-256 public key using escrow-wrap-v1.
 *
 * @param privateKey - Sender P-256 private JWK JSON.
 * @param publicKey - Recipient P-256 public JWK JSON.
 * @param plaintext - Bytes to encrypt.
 * @returns Unprefixed hex of `nonce || ciphertext+tag`.
 */
export function encryptToPublic(
  privateKey: string,
  publicKey: string,
  plaintext: Uint8Array,
): string {
  const key = deriveTransportKey(privateKey, publicKey);
  const nonce = randomBytes(CHACHA_NONCE_LEN);
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
export function decryptFromPublic(
  privateKey: string,
  publicKey: string,
  ciphertextHex: string,
): Uint8Array {
  const key = deriveTransportKey(privateKey, publicKey);
  const blob = decodeHex(ciphertextHex);
  if (blob.length < CHACHA_NONCE_LEN) {
    throw new Error('Wrapped secret is truncated');
  }
  return chacha20poly1305(key, blob.subarray(0, CHACHA_NONCE_LEN)).decrypt(
    blob.subarray(CHACHA_NONCE_LEN),
  );
}

function deriveTransportKey(privateKey: string, publicKey: string): Uint8Array {
  const privateBytes = privateKeyBytesFromJwk(privateKey);
  const publicBytes = publicKeyBytesFromJwk(publicKey);
  const shared = p256.getSharedSecret(privateBytes, publicBytes);
  // noble returns a compressed point (33 bytes). Cubist uses the 32-byte x-coordinate.
  const ikm = shared.slice(1, 33);
  return hkdf(sha256Sync, ikm, undefined, WRAP_INFO, CHACHA_KEY_LEN);
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
 * @param length - Number of bytes to generate.
 * @returns CSPRNG bytes.
 */
function randomBytes(length: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

/**
 * Decodes unpadded base64url JWK coordinates.
 *
 * @param value - Base64url string.
 * @returns Raw bytes.
 */
function fromBase64Url(value: string): Uint8Array {
  return base64ToBytes(
    value
      .replace(/-/gu, '+')
      .replace(/_/gu, '/')
      .padEnd(value.length + ((4 - (value.length % 4)) % 4), '='),
  );
}

/**
 * Recursively sorts keys and encodes Uint8Array as hex.
 *
 * @param value - Value to normalize.
 * @returns JSON-safe canonical form.
 */
function sortKeys(value: unknown): unknown {
  if (value instanceof Uint8Array) {
    return bytesToHex(value);
  }
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}
